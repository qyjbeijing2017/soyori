import type { TextGenerationPipeline } from "@huggingface/transformers";
import { LOCAL_REVISION } from "./definitions.js";
import { type GenerateInput, type GenerateResult, LOCAL_MODEL } from "./index.js";
import { localMessages, localResult, localTemplateOptions } from "./local-tools.js";
import { prepareExternalWeights } from "./onnx-external.js";
import { createPreview, type ModelEvent } from "./stream.js";

/** Browser hosts prepare complete model files before inference; no hidden downloads. */
export async function configureBrowserModelCache(
  cacheName: string,
  runtimePaths?: { wasm: string; mjs: string },
) {
  const { env } = await import("@huggingface/transformers");
  const cache = await caches.open(cacheName);
  const pinnedPrefix = `https://huggingface.co/${LOCAL_MODEL}/resolve/${LOCAL_REVISION}/`;
  await prepareExternalWeights(cache, `${pinnedPrefix}onnx/model_q4f16.onnx`);
  // Pipeline file discovery in Transformers 4.3 uses main even with a revision.
  // Resolve that alias to our pinned files without storing or fetching main.
  const mainPrefix = `https://huggingface.co/${LOCAL_MODEL}/resolve/main/`;
  const match = (url: string) =>
    cache.match(url.startsWith(mainPrefix) ? pinnedPrefix + url.slice(mainPrefix.length) : url);
  env.allowLocalModels = false;
  // Transformers requires one source enabled even when all files come from cache.
  // Its fetch hook stays cache-only, including optional files absent from the manifest.
  env.allowRemoteModels = true;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  env.fetch = async (url, init) => {
    const key = String(url);
    const runtimeURL =
      runtimePaths &&
      Object.values(runtimePaths).some(
        (path) => key === new URL(path, globalThis.location?.href ?? "http://localhost/").href,
      );
    if (runtimeURL || key.startsWith("https://cdn.jsdelivr.net/npm/onnxruntime-web@"))
      return nativeFetch(url, init);
    return (await match(key)) ?? new Response(null, { status: 404 });
  };
  env.useBrowserCache = false;
  // ORT owns runtime asset loading; the managed cache contains model files only.
  env.useWasmCache = true;
  if (env.backends.onnx.wasm) {
    if (runtimePaths) env.backends.onnx.wasm.wasmPaths = runtimePaths;
  }
  env.useCustomCache = true;
  env.customCache = {
    match,
    put: async () => {},
  };
}

export interface LocalOptions {
  device: "cpu" | "webgpu";
  cacheDir?: string;
  progress?: (message: string) => void;
  stream?: (event: ModelEvent) => void;
}

/** One instance per host worker; retain successful sessions until explicit release. */
export function createLocalModel(options: LocalOptions) {
  let pipelinePromise: Promise<TextGenerationPipeline> | undefined;
  let busy = false;
  async function load() {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        const { pipeline, env } = await import("@huggingface/transformers");
        if (options.cacheDir) env.cacheDir = options.cacheDir;
        if (options.device === "webgpu") env.allowLocalModels = false;
        options.progress?.("正在加载本地模型；首次使用需要下载模型文件。");
        return pipeline("text-generation", LOCAL_MODEL, {
          device: options.device,
          revision: LOCAL_REVISION,
          dtype: options.device === "webgpu" ? "q4f16" : "q4",
          ...(options.device === "webgpu" && typeof caches !== "undefined"
            ? { use_external_data_format: true }
            : {}),
          progress_callback: (event) => {
            if (
              (event.status === "done" || (event.status === "progress" && event.progress >= 100)) &&
              event.file.endsWith(".onnx_data")
            )
              options.progress?.(
                "权重读取完成，正在初始化推理会话；此阶段暂无百分比，可随时停止。",
              );
            else if (event.status === "progress")
              options.progress?.(`加载 ${event.file}：${Math.round(event.progress)}%`);
            else if (event.status === "ready") options.progress?.("本地模型已就绪。");
          },
        });
      })();
      pipelinePromise.catch(() => {
        pipelinePromise = undefined;
      });
    }
    return pipelinePromise;
  }
  return {
    async initialize() {
      if (busy) throw new Error("AI_BUSY: Local model is already running.");
      await load();
    },
    async generate(input: GenerateInput, signal?: AbortSignal): Promise<GenerateResult> {
      if (busy) throw new Error("AI_BUSY: Local model is already running.");
      busy = true;
      const started = performance.now();
      let loadedAt = started;
      let generatedAt = started;
      let firstTokenAt: number | undefined;
      let tokens = 0;
      let failed = true;
      const preview = createPreview(options.stream);
      try {
        signal?.throwIfAborted();
        const generator = await load();
        loadedAt = performance.now();
        signal?.throwIfAborted();
        const prompt = generator.tokenizer.apply_chat_template(
          localMessages(input),
          localTemplateOptions(input),
        );
        if (typeof prompt !== "string") throw new Error("AI_LOCAL: Invalid chat template.");
        const encoded = generator.tokenizer(prompt);
        if (encoded.input_ids.size + input.maxTokens > 2048)
          throw new Error("AI_CONTEXT_LIMIT: Local input and output must fit within 2048 tokens.");
        const temperature = input.temperature ?? 0.7;
        options.progress?.("本地模型正在生成……");
        const { TextStreamer } = await import("@huggingface/transformers");
        generatedAt = performance.now();
        const streamer = new TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: false,
          callback_function: preview,
          token_callback_function: (ids) => {
            firstTokenAt ??= performance.now();
            tokens += ids.length;
          },
        });
        const result = await generator(prompt, {
          streamer,
          max_new_tokens: input.maxTokens,
          return_full_text: false,
          skip_special_tokens: !input.toolDefinitions?.length,
          do_sample: temperature > 0,
          ...(temperature > 0 ? { temperature, top_k: 20, top_p: 0.8 } : {}),
        });
        signal?.throwIfAborted();
        const item = result[0];
        if (!item || !("generated_text" in item) || typeof item.generated_text !== "string")
          throw new Error("AI_LOCAL: Unexpected generation result.");
        const ended = performance.now();
        const metrics = {
          loadMs: Math.round(loadedAt - started),
          promptMs: Math.round(generatedAt - loadedAt),
          generationMs: Math.round(ended - generatedAt),
          firstTokenMs: Math.round((firstTokenAt ?? ended) - generatedAt),
          outputTokens: tokens,
          tokensPerSecond: Number(((tokens * 1000) / Math.max(1, ended - generatedAt)).toFixed(2)),
        };
        options.stream?.({ type: "metrics", values: metrics });
        const parsed = localResult(item.generated_text, input);
        failed = false;
        return { ...parsed, usage: metrics };
      } finally {
        // Keep successful sessions warm. A failed session is discarded, never silently retried.
        const disposingAt = performance.now();
        try {
          if (failed) {
            const current = pipelinePromise;
            pipelinePromise = undefined;
            if (current)
              await current.then(
                (generator) => generator.dispose(),
                () => {},
              );
          }
        } finally {
          options.stream?.({
            type: "metrics",
            values: {
              disposeMs: Math.round(performance.now() - disposingAt),
              totalMs: Math.round(performance.now() - started),
            },
          });
          busy = false;
        }
      }
    },
    async dispose() {
      if (busy) throw new Error("AI_BUSY: Cannot dispose an active model.");
      const current = pipelinePromise;
      pipelinePromise = undefined;
      if (current) await (await current).dispose();
    },
  };
}
