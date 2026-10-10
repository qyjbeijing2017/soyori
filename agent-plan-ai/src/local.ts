import type { TextGenerationPipeline } from "@huggingface/transformers";
import { type GenerateInput, type GenerateResult, LOCAL_MODEL } from "./index.js";
import { localMessages, localResult } from "./local-tools.js";

export interface LocalOptions {
  device: "cpu" | "webgpu";
  cacheDir?: string;
  progress?: (message: string) => void;
}

/** One instance per host worker; calls reuse weights, never conversation state. */
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
          dtype: options.device === "webgpu" ? "q4f16" : "q4",
          progress_callback: (event) => {
            if (event.status === "progress")
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
    async generate(input: GenerateInput, signal?: AbortSignal): Promise<GenerateResult> {
      if (busy) throw new Error("AI_BUSY: Local model is already running.");
      busy = true;
      try {
        signal?.throwIfAborted();
        const generator = await load();
        signal?.throwIfAborted();
        const prompt = generator.tokenizer.apply_chat_template(localMessages(input), {
          tokenize: false,
          add_generation_prompt: true,
        });
        if (typeof prompt !== "string") throw new Error("AI_LOCAL: Invalid chat template.");
        const encoded = generator.tokenizer(prompt);
        if (encoded.input_ids.size + input.maxTokens > 2048)
          throw new Error("AI_CONTEXT_LIMIT: Local input and output must fit within 2048 tokens.");
        options.progress?.("本地模型正在生成……");
        const result = await generator(prompt, {
          max_new_tokens: input.maxTokens,
          return_full_text: false,
          skip_special_tokens: !input.toolDefinitions?.length,
          do_sample: (input.temperature ?? 0) > 0,
          ...(input.temperature ? { temperature: input.temperature, top_k: 50 } : {}),
          repetition_penalty: 1.05,
        });
        signal?.throwIfAborted();
        const item = result[0];
        if (!item || !("generated_text" in item) || typeof item.generated_text !== "string")
          throw new Error("AI_LOCAL: Unexpected generation result.");
        return localResult(item.generated_text, input);
      } finally {
        busy = false;
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
