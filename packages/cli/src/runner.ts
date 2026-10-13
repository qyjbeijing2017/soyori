import { fork } from "node:child_process";
import { createProgress } from "./progress.js";
import type { Request, WorkerMessage } from "./protocol.js";
import { CliError, failure } from "./protocol.js";
import { TraceWriter } from "./trace.js";

type Result = Extract<WorkerMessage, { type: "result" }>;

/** The parent owns output, trace storage and termination; arbitrary host code runs in the child. */
export async function runIsolated(
  request: Request,
  timeout: number,
  tracePath?: string,
): Promise<Result> {
  const writer = tracePath === undefined ? undefined : await TraceWriter.create(tracePath);
  try {
    if (writer)
      await writer.write({
        type: "start",
        command: request.command,
        file: request.file,
        values: request.traceValues,
      });
    const result = await new Promise<Result>((resolve) => {
      const child = fork(new URL("./worker.js", import.meta.url), [], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        execArgv: [],
      });
      let result: Result | undefined;
      let writes = Promise.resolve();
      const progress = createProgress(process.stderr);
      child.stdout?.on("data", (chunk: Buffer) => progress.log(chunk));
      child.stderr?.on("data", (chunk: Buffer) => progress.log(chunk));
      const finish = (message: Result): void => {
        if (result) return;
        result = message;
        child.kill("SIGKILL");
      };
      const fail = (code: string, message: string): void =>
        finish({ type: "result", reply: { version: 1, ok: false, error: { code, message } } });
      const timer = setTimeout(() => fail("TIMEOUT", `Execution exceeded ${timeout}ms.`), timeout);
      const interrupt = (): void => fail("INTERRUPTED", "Execution interrupted.");
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", interrupt);
      child.on("message", (message: WorkerMessage) => {
        if (result) return;
        if (message.type === "progress") progress.update(message.message);
        else if (message.type === "result") finish(message);
        else if (message.type === "trace") {
          writes = writes
            .then(async () => {
              if (!writer) throw new CliError("INTERNAL_ERROR", "Unexpected trace record.");
              await writer.write(message.record);
              if (!result && child.connected)
                child.send({ type: "ack" }, (error) => {
                  if (error && !result) fail("WORKER_ERROR", error.message);
                });
            })
            .catch((error: unknown) =>
              finish({ type: "result", reply: { version: 1, ok: false, error: failure(error) } }),
            );
        }
      });
      child.on("error", (error) => fail("WORKER_ERROR", error.message));
      child.once("close", (code, signal) => {
        progress.finish();
        clearTimeout(timer);
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", interrupt);
        void writes.then(() =>
          resolve(
            result ?? {
              type: "result",
              reply: {
                version: 1,
                ok: false,
                error: {
                  code: "WORKER_EXIT",
                  message: `Execution process exited without a result (${signal ?? code}).`,
                },
              },
            },
          ),
        );
      });
      child.send(request, (error) => {
        if (error) fail("WORKER_ERROR", error.message);
      });
    });
    if (writer)
      await writer.write({
        type: "end",
        ok: result.reply.ok,
        ...(result.reply.ok ? {} : { error: result.reply.error }),
      });
    return result;
  } finally {
    await writer?.close();
  }
}
