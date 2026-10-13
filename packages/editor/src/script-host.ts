import { describeTools, toJsonValue } from "soyori-core";
import { SCRIPT_TOOL_DEFINITION, scriptInput } from "soyori-script";
import { listFiles } from "./workspace-files";

export function createBrowserScriptTools(source: () => string | undefined, signal: AbortSignal) {
  return describeTools(
    {
      "script.run": async (raw: Record<string, unknown>) => {
        scriptInput(raw);
        signal.throwIfAborted();
        const input = toJsonValue(raw.input === undefined ? {} : raw.input);
        const origin = source();
        const parent =
          origin && /^(workspace:|https:)/.test(origin) ? origin : "workspace:/flow.yaml";
        const files = (await listFiles())
          .filter((file) => file.kind === "file")
          .map(({ path, content }) => ({ path, content }));
        signal.throwIfAborted();
        return new Promise((resolve, reject) => {
          const worker = new Worker(new URL("./script.worker.ts", import.meta.url), {
            type: "module",
          });
          const finish = (error?: Error, value?: unknown) => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            worker.terminate();
            if (error) reject(error);
            else resolve(value);
          };
          const abort = () => finish(Error("SCRIPT_CANCELLED"));
          const timer = setTimeout(
            () => finish(Error("SCRIPT_TIMEOUT: Script exceeded 30 seconds.")),
            30_000,
          );
          signal.addEventListener("abort", abort, { once: true });
          worker.onmessage = (event) =>
            event.data.ok ? finish(undefined, event.data.result) : finish(Error(event.data.error));
          worker.onerror = (event) => finish(Error(event.message || "SCRIPT_WORKER_ERROR"));
          try {
            worker.postMessage({ raw: { ...raw, input }, parent, files });
          } catch (error) {
            finish(error instanceof Error ? error : Error(String(error)));
          }
        });
      },
    },
    { "script.run": SCRIPT_TOOL_DEFINITION },
  );
}
