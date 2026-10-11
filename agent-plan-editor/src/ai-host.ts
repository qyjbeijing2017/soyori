import {
  createAiTools,
  createMemoryTools,
  createToolExecutionTools,
  createToolRegistry,
  type GenerateInput,
  type GenerateResult,
  type ModelEvent,
} from "agent-plan-ai";
import { createTokenTools } from "agent-plan-ai/tokens";
import type { LoadedFlow, RuntimeFunction } from "agent-plan-core";
import { createStorageTools } from "agent-plan-storage";
import { createBrowserStorage } from "agent-plan-storage/browser";
import { createBasicTools } from "agent-plan-tools";
import type { AiSettings } from "./ai-settings";
import { createAssistantTools } from "./assistant-tools.ts";
import { ModelDownloadManager } from "./model-download";
import { configureManagedModelCache } from "./model-files";
import { createBrowserScriptTools } from "./script-host";

export { type AiSettings, initialAiSettings } from "./ai-settings";

export class BrowserAiHost {
  documentation?: import("./documentation").Documentation;
  readonly downloads = new ModelDownloadManager();
  private state: { status: "idle" | "initializing" | "ready" | "error"; error: string } = {
    status: "idle",
    error: "",
  };
  private listeners = new Set<() => void>();
  private initialization?: Promise<void>;
  private initializationController?: AbortController;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(status: typeof this.state.status, error = "") {
    this.state = { status, error };
    for (const listener of this.listeners) listener();
  }
  initialize(): Promise<void> {
    if (this.state.status === "ready") return Promise.resolve();
    if (this.initialization) return this.initialization;
    const controller = new AbortController();
    this.initializationController = controller;
    this.update("initializing");
    const task = (async () => {
      try {
        const gpu = (
          navigator as Navigator & {
            gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
          }
        ).gpu;
        const adapter = await gpu?.requestAdapter();
        if (!adapter?.features.has("shader-f16"))
          throw new Error(
            "此浏览器或设备不支持本地模型所需的 WebGPU / shader-f16，请选择 API 模型或使用支持的设备。",
          );
        controller.signal.throwIfAborted();
        await this.downloads.ensure("model", controller.signal);
        controller.signal.throwIfAborted();
        await this.request({ type: "initialize" }, controller.signal, () => {});
        controller.signal.throwIfAborted();
        this.update("ready");
      } catch (cause) {
        if (!controller.signal.aborted) this.update("error", String(cause));
        throw cause;
      } finally {
        if (this.initializationController === controller) {
          this.initialization = undefined;
          this.initializationController = undefined;
        }
      }
    })();
    this.initialization = task;
    return task;
  }
  cancelInitialization() {
    if (this.initializationController) this.dispose();
  }
  private tokenTools = createTokenTools({ browser: true });
  private worker?: Worker;
  private pending = false;
  private cancelPending?: () => void;

  tools(
    settings: AiSettings,
    signal: AbortSignal,
    progress: (message: string) => void,
    graph?: LoadedFlow,
    activeSource?: () => string | undefined,
    stream?: (event: ModelEvent) => void,
    running = false,
  ) {
    const registry: Record<string, RuntimeFunction> = {};
    const storage = createBrowserStorage();
    const scope = createToolRegistry(registry, graph, activeSource, signal);
    Object.assign(registry, {
      ...createBasicTools({ signal, browser: true }),
      ...createBrowserScriptTools(() => scope.source() ?? graph?.source, signal),
      ...createStorageTools(storage),
      "tokens.count": Object.assign(
        async (input: Record<string, unknown>) => {
          if ((input.mode ?? "local") === "local") {
            // Use the tool's own validation before initiating any network request.
            await this.tokenTools["tokens.count"]({ ...input, mode: "estimate" });
            signal.throwIfAborted();
            if (!settings.allowLocalDownload)
              throw new Error("请先在 AI 设置中允许下载本地 tokenizer，或使用 estimate 模式。");
            await this.downloads.ensure("tokenizer", signal);
            await configureManagedModelCache();
            signal.throwIfAborted();
          }
          const result = await this.tokenTools["tokens.count"](input);
          signal.throwIfAborted();
          return result;
        },
        { definition: this.tokenTools["tokens.count"].definition },
      ),
      ...createAiTools({
        ...(stream ? { stream } : {}),
        registry: scope.registry,
        browser: true,
        signal,
        local: async (input) => {
          if (!settings.allowLocalDownload)
            throw new Error("请先在 AI 设置中允许下载本地模型（约 1.44 GB 权重，另需运行库）。");
          if (this.state.status !== "ready") {
            progress("正在初始化本地模型，可能需要几分钟，请耐心等待。");
            const stop = () => this.dispose();
            signal.addEventListener("abort", stop, { once: true });
            try {
              signal.throwIfAborted();
              await this.initialize();
              signal.throwIfAborted();
            } finally {
              signal.removeEventListener("abort", stop);
            }
          }
          return this.request(input, signal, progress, stream) as Promise<GenerateResult>;
        },
      }),
      ...createToolExecutionTools({ registry: scope.registry, signal }),
    });
    Object.assign(registry, createMemoryTools(storage));
    Object.assign(
      registry,
      createAssistantTools({
        signal,
        docs: this.documentation,
        registry,
        running,
        changed: () => globalThis.dispatchEvent?.(new Event("agent-plan-workspace-changed")),
        functions: (target, source, childSignal) =>
          this.tools(settings, childSignal, progress, target, source, undefined, true),
      }),
    );
    for (const provider of ["openai", "anthropic"] as const) {
      const name = `llm.${provider}`;
      const original = registry[name];
      registry[name] = Object.assign(
        (input: Record<string, unknown>) =>
          original({
            ...input,
            apiKey: input.apiKey ?? settings[provider].apiKey.trim(),
            baseURL: input.baseURL ?? settings[provider].baseURL.trim(),
            model: input.model ?? settings[provider].model.trim(),
          }),
        { definition: original.definition },
      );
    }
    return registry;
  }

  private request(
    input: GenerateInput | { type: "initialize" },
    signal: AbortSignal,
    progress: (message: string) => void,
    stream?: (event: ModelEvent) => void,
  ): Promise<GenerateResult | undefined> {
    if (this.pending) return Promise.reject(new Error("本地模型正在运行。"));
    if (signal.aborted) return Promise.reject(new Error("AI 调用已取消。"));
    return new Promise((resolve, reject) => {
      const worker =
        this.worker ??
        new Worker(new URL("./local-model.worker.ts", import.meta.url), { type: "module" });
      this.worker = worker;
      this.pending = true;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        this.pending = false;
        this.cancelPending = undefined;
        worker.onmessage = null;
        worker.onerror = null;
      };
      const fail = (message: string) => {
        cleanup();
        worker.terminate();
        this.worker = undefined;
        if (!signal.aborted) this.update("error", message);
        reject(new Error(message));
      };
      const abort = () => fail("AI 调用已取消，本地模型已释放。可以重新运行。");
      const timer = setTimeout(
        () => fail("本地模型加载或生成超过 10 分钟，已终止。请检查网络或减少输入后重试。"),
        600_000,
      );
      this.cancelPending = abort;
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () => fail("本地模型 Worker 失败。请检查浏览器兼容性或重新加载页面。");
      worker.onmessage = (event) => {
        if (event.data.type === "progress") progress(event.data.message);
        else if (event.data.type === "stream") stream?.(event.data.event);
        else if (event.data.type === "error") fail(event.data.message);
        else if (event.data.type === "initialized") {
          cleanup();
          resolve(undefined);
        } else if (event.data.type === "result") {
          cleanup();
          resolve(event.data.result);
        }
      };
      try {
        worker.postMessage(input);
      } catch {
        fail("无法向本地模型发送请求，请检查输入并重试。");
      }
    });
  }

  dispose() {
    this.initializationController?.abort();
    this.initialization = undefined;
    this.initializationController = undefined;
    this.downloads.stop();
    this.cancelPending?.();
    this.worker?.terminate();
    this.worker = undefined;
    this.update("idle");
  }
}
