import { downloadFile, isStorageQuotaError, ModelDownloadStore } from "./model-download-store.ts";
import {
  MODEL_CACHE,
  MODEL_FILES,
  modelFileURL,
  openManagedModelCache,
  TOKENIZER_FILES,
} from "./model-files.ts";

export type DownloadScope = "tokenizer" | "model";
const dismissedKey = "agent-plan-model-download-dismissed";
function downloadDismissed() {
  try {
    return localStorage.getItem(dismissedKey) === "true";
  } catch {
    return false;
  }
}
function setDownloadDismissed(dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(dismissedKey, "true");
    else localStorage.removeItem(dismissedKey);
  } catch {
    /* The current page still supports cancellation without localStorage. */
  }
}
export interface DownloadState {
  status: "idle" | "downloading" | "paused" | "stopped" | "ready" | "error" | "clearing";
  scope: DownloadScope;
  file: string;
  loaded: number;
  total: number;
  error: string;
  errorKind: "" | "storage-quota";
}
export class ModelDownloadManager {
  private state: DownloadState = {
    status: "idle",
    scope: "model",
    file: "",
    loaded: 0,
    total: MODEL_FILES.reduce((sum, f) => sum + f.size, 0),
    error: "",
    errorKind: "",
  };
  private listeners = new Set<() => void>();
  private store = new ModelDownloadStore();
  private task?: Promise<void>;
  private clearing?: Promise<void>;
  private generation = 0;
  private controller?: AbortController;
  private requestController?: AbortController;
  private wake?: () => void;
  private lastUpdate = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(next: Partial<DownloadState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  async restore() {
    const cache = await openManagedModelCache();
    const loaded = await Promise.all(
      MODEL_FILES.map(async (file) => {
        const url = modelFileURL(file.path);
        const cached = !!(await cache.match(url));
        return {
          cached,
          bytes: cached ? file.size : ((await this.store.progress(url))?.offset ?? 0),
        };
      }),
    );
    if (this.task || this.clearing) return;
    const total = MODEL_FILES.reduce((n, f) => n + f.size, 0);
    const sum = loaded.reduce((n, x) => n + x.bytes, 0);
    this.update({
      loaded: sum,
      total,
      status: loaded.every((file) => file.cached)
        ? "ready"
        : sum
          ? downloadDismissed()
            ? "stopped"
            : "paused"
          : "idle",
    });
  }
  pause() {
    if (this.state.status !== "downloading") return;
    this.update({ status: "paused" });
    this.requestController?.abort();
  }
  resume() {
    if (this.task) {
      if (this.state.status === "paused") {
        this.update({ status: "downloading" });
        this.wake?.();
      }
    } else void this.ensure(this.state.scope).catch(() => {});
  }
  stop() {
    this.generation++;
    if (["downloading", "paused", "error"].includes(this.state.status)) {
      setDownloadDismissed(true);
      this.update({ status: "stopped", error: "", errorKind: "" });
    }
    if (!this.task) {
      return;
    }
    this.update({ status: "stopped" });
    this.controller?.abort();
    this.requestController?.abort();
    this.wake?.();
  }
  async clear() {
    if (this.clearing) return this.clearing;
    const task = (async () => {
      this.stop();
      await this.task?.catch(() => {});
      this.update({ status: "clearing", error: "", errorKind: "" });
      const cache = await caches.open(MODEL_CACHE);
      for (const file of MODEL_FILES) {
        const url = modelFileURL(file.path);
        await this.store.clear(url);
        await cache.delete(url);
        await cache.delete(`${url}_data`);
      }
      setDownloadDismissed(false);
      this.update({
        status: "idle",
        scope: "model",
        loaded: 0,
        total: MODEL_FILES.reduce((n, file) => n + file.size, 0),
        file: "",
      });
    })();
    this.clearing = task;
    try {
      await task;
    } catch (cause) {
      this.update({ status: "error", error: String(cause), errorKind: "" });
      throw cause;
    } finally {
      this.clearing = undefined;
    }
  }
  async ensure(scope: DownloadScope, signal?: AbortSignal): Promise<void> {
    await this.clearing;
    const generation = this.generation;
    const checkCancelled = () => {
      signal?.throwIfAborted();
      if (generation !== this.generation)
        throw new DOMException("Download cancelled.", "AbortError");
    };
    checkCancelled();
    const stop = () => this.stop();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      if (this.task) await this.task;
      checkCancelled();
      const cache = await openManagedModelCache();
      const files = scope === "model" ? MODEL_FILES : TOKENIZER_FILES;
      const available = await Promise.all(files.map((f) => cache.match(modelFileURL(f.path))));
      checkCancelled();
      if (available.every(Boolean)) return;
      // Recheck after awaits so concurrent callers share one writer.
      if (this.task) {
        await this.task;
        checkCancelled();
        return this.ensure(scope, signal);
      }
      checkCancelled();
      const controller = new AbortController();
      this.controller = controller;
      this.task = this.run(scope, controller.signal);
      try {
        await this.task;
      } finally {
        this.task = undefined;
        this.controller = undefined;
      }
    } catch (cause) {
      if (this.state.status !== "stopped" && generation === this.generation)
        this.update({
          status: signal?.aborted ? "stopped" : "error",
          error: signal?.aborted ? "" : String(cause),
          errorKind: !signal?.aborted && isStorageQuotaError(cause) ? "storage-quota" : "",
        });
      throw cause;
    } finally {
      signal?.removeEventListener("abort", stop);
    }
  }
  private async run(scope: DownloadScope, signal: AbortSignal) {
    const files = scope === "model" ? MODEL_FILES : TOKENIZER_FILES;
    const total = files.reduce((n, f) => n + f.size, 0);
    setDownloadDismissed(false);
    this.update({ status: "downloading", scope, total, loaded: 0, error: "", errorKind: "" });
    try {
      const cache = await openManagedModelCache();
      let completed = 0;
      for (const file of files) {
        this.update({ file: file.path });
        while (true) {
          signal.throwIfAborted();
          if (this.state.status === "paused")
            await new Promise<void>((resolve) => {
              this.wake = resolve;
            });
          this.wake = undefined;
          signal.throwIfAborted();
          const request = new AbortController();
          this.requestController = request;
          try {
            await downloadFile(
              { url: modelFileURL(file.path), size: file.size },
              this.store,
              cache,
              AbortSignal.any([signal, request.signal]),
              fetch,
              (offset) => {
                if (Date.now() - this.lastUpdate > 100 || offset === file.size) {
                  this.lastUpdate = Date.now();
                  this.update({ loaded: completed + offset });
                }
              },
            );
            break;
          } catch (cause) {
            if (signal.aborted) throw cause;
            // A quick resume can occur before the paused request unwinds.
            if (!request.signal.aborted) throw cause;
          } finally {
            this.requestController = undefined;
          }
        }
        completed += file.size;
      }
      this.update({ status: "ready", loaded: total, file: "" });
    } catch (cause) {
      this.update({
        status: signal.aborted ? "stopped" : "error",
        error: signal.aborted ? "" : String(cause),
        errorKind: !signal.aborted && isStorageQuotaError(cause) ? "storage-quota" : "",
      });
      throw cause;
    }
  }
}
