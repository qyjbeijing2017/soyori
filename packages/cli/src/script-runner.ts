import { Worker } from "node:worker_threads";
import { describeTools, toJsonValue } from "soyori-core";
import { SCRIPT_TOOL_DEFINITION, scriptInput } from "soyori-script";
import { CliError } from "./protocol.js";

export { SCRIPT_TOOL_DEFINITION } from "soyori-script";

export function createScriptTools(source: () => string | undefined) {
  return describeTools(
    {
      "script.run": (raw: Record<string, unknown>) => {
        const { code } = scriptInput(raw);
        return runScript(code, raw.input, source());
      },
    },
    { "script.run": SCRIPT_TOOL_DEFINITION },
  );
}

/** A fresh worker owns loading, execution and serialization for each invocation. */
export async function runScript(code: string, input: unknown, source?: string): Promise<unknown> {
  scriptInput({ code });
  const data = toJsonValue(input === undefined ? {} : input);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./script-worker.js", import.meta.url), {
      workerData: { code, input: data, source },
      execArgv: [],
      stdout: true,
      stderr: true,
    });
    worker.stdout.pipe(process.stderr, { end: false });
    worker.stderr.pipe(process.stderr, { end: false });
    let settled = false;
    const finish = (error?: Error, value?: unknown): void => {
      if (settled) return;
      settled = true;
      void worker.terminate().then(() => (error ? reject(error) : resolve(value)), reject);
    };
    worker.once("message", (message) => {
      if (message.ok) finish(undefined, message.result);
      else finish(new CliError(message.error.code, message.error.message));
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled)
        finish(new CliError("SCRIPT_EXIT", `Script exited without a result (${code}).`));
    });
  });
}
