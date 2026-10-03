import {
  type Connection,
  createAiTools,
  type GenerateInput,
  type GenerateResult,
} from "agent-plan-ai";
import { createTokenTools } from "agent-plan-ai/tokens";
import { createStorageTools } from "agent-plan-storage";
import { createBrowserStorage } from "agent-plan-storage/browser";

export interface AiSettings {
  openai: Connection;
  anthropic: Connection;
  allowLocalDownload: boolean;
}
export const initialAiSettings: AiSettings = {
  openai: {},
  anthropic: {},
  allowLocalDownload: true,
};

export class BrowserAiHost {
  private worker?: Worker;
  private pending = false;
  private cancelPending?: () => void;

  tools(settings: AiSettings, signal: AbortSignal, progress: (message: string) => void) {
    return {
      ...createStorageTools(createBrowserStorage()),
      ...createTokenTools({
        browser: true,
        beforeLoad: () => {
          signal.throwIfAborted();
          if (!settings.allowLocalDownload)
            throw new Error("请先在 AI 设置中允许下载本地 tokenizer，或使用 estimate 模式。");
        },
      }),
      ...createAiTools({
        browser: true,
        signal,
        connection: (provider) => settings[provider],
        local: (input) => {
          if (!settings.allowLocalDownload)
            throw new Error("请先在 AI 设置中允许下载本地模型（约 255 MB 权重，另需运行库）。");
          return this.generate(input, signal, progress);
        },
      }),
    };
  }

  private generate(
    input: GenerateInput,
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<GenerateResult> {
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
        else if (event.data.type === "error") fail(event.data.message);
        else if (event.data.type === "result") {
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
    this.cancelPending?.();
    this.worker?.terminate();
    this.worker = undefined;
  }
}
