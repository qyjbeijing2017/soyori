import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { createMemoryTools, createToolRegistry } from "soyori-ai";
import type { RunState, RuntimeFunction } from "soyori-core";
import {
  createRuntime,
  inspectFlow,
  redactFailure,
  redactFields,
  withoutSensitiveInitials,
} from "soyori-core";
import { createStorageTools } from "soyori-storage";
import { createRuntimeEnvironment, loadEnvironment } from "soyori-storage/environment";
import { createFileStorage } from "soyori-storage/node";
import { createBasicTools } from "soyori-tools";
import { cliAiTools } from "./ai-tools.js";
import { loadFlowDocument } from "./flow-file.js";
import { loadFlowGraph } from "./flow-loader.js";
import { resolveSource } from "./flow-source.js";
import type { Request, WorkerMessage } from "./protocol.js";
import { CliError, failure, success } from "./protocol.js";
import { createScriptTools } from "./script-runner.js";
import { storageLocation } from "./storage-config.js";
import { summarize } from "./summary.js";

function send(message: WorkerMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.send) return reject(new Error("Worker requires IPC."));
    process.send(message, (error) => (error ? reject(error) : resolve()));
  });
}

async function trace(record: Record<string, unknown>): Promise<void> {
  // Parent acknowledges only after the record is written; at most one record is in flight.
  const ack = new Promise<void>((resolve) => process.once("message", () => resolve()));
  await send({ type: "trace", record });
  await ack;
}

function snapshot(state: RunState, values: boolean, sensitive: readonly string[] = []) {
  return {
    invocationId: state.invocationId,
    flowName: state.flowName,
    ...(state.source === undefined ? {} : { source: state.source }),
    depth: state.depth,
    status: state.status,
    nextStepPath: state.nextStepPath,
    ...(values ? { fields: summarize(redactFields(state.fields, sensitive)) } : {}),
  };
}

async function execute(request: Request): Promise<void> {
  if (request.command === "inspect") {
    const document = await loadFlowDocument(await resolveSource(request.file));
    const result = {
      ...inspectFlow(withoutSensitiveInitials(document.definition)),
      source: document.source,
    };
    await send({
      type: "result",
      reply: success(result),
      text: inspect(result, { depth: null, colors: false }),
    });
    return;
  }
  const flow = await loadFlowGraph(request.file, request.flows);
  let functions: Record<string, RuntimeFunction> = {};
  if (request.functions !== undefined) {
    const module = (await import(pathToFileURL(resolve(request.functions)).href)) as {
      default?: unknown;
    };
    const registry = module.default;
    if (registry === null || typeof registry !== "object" || Array.isArray(registry)) {
      throw new CliError(
        "INVALID_FUNCTIONS",
        "Function module must default-export an object of functions.",
      );
    }
    functions = registry as Record<string, RuntimeFunction>;
  }
  const registry: Record<string, RuntimeFunction> = {};
  const scope = createToolRegistry(registry, flow, () => runtime.getStack().at(-1)?.source);
  const storage = createFileStorage(request.storageDir ?? (await storageLocation()).directory);
  const globalEnvironment = await loadEnvironment(
    createFileStorage(
      join(request.storageDir ?? (await storageLocation()).directory, ".environment"),
    ),
  );
  const systemEnvironment = Object.fromEntries(
    Object.entries(process.env)
      .filter(
        ([name, value]) =>
          /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) &&
          !["__proto__", "constructor", "prototype"].includes(name) &&
          typeof value === "string",
      )
      .map(([name, value]) => [name, { value: value!, sensitive: true }]),
  );
  const environment = createRuntimeEnvironment(
    { ...globalEnvironment, ...systemEnvironment, ...request.environment },
    async (path) => {
      const source = scope.source() ?? flow.source;
      if (!source?.startsWith("file:"))
        throw Error("ENV_SOURCE: Local configuration requires a local calling flow.");
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) && !/^[a-zA-Z]:[\\/]/.test(path))
        throw Error("ENV_SOURCE: Expected a local path.");
      const target = resolve(fileURLToPath(new URL(".", source)), path);
      if ((await stat(target)).size > 2 * 1024 * 1024)
        throw Error("ENV_FILE_LIMIT: Configuration exceeds 2 MiB.");
      return readFile(target, "utf8");
    },
  );
  const aiTools = cliAiTools(
    (message) => {
      if (process.connected) process.send?.({ type: "progress", message });
    },
    scope.registry,
    environment.strings,
  );
  const storageTools = {
    ...createStorageTools(storage),
    ...environment.tools,
    ...createMemoryTools(storage),
    ...createBasicTools({
      get environment() {
        return environment.strings();
      },
    }),
  };
  const reserved = ["script.run", ...Object.keys(aiTools), ...Object.keys(storageTools)].find(
    (name) => Object.hasOwn(functions, name),
  );
  if (reserved)
    throw new CliError("INVALID_FUNCTIONS", `${reserved} is reserved for built-in tools.`);
  Object.assign(registry, {
    ...functions,
    ...aiTools,
    ...storageTools,
    ...createScriptTools(() => scope.source() ?? flow.source),
  });
  const runtime = createRuntime(flow, request.input, { functions: registry });
  if (request.command === "validate") {
    const result = { valid: true, flowName: flow.definition.name, source: flow.source };
    await send({ type: "result", reply: success(result), text: `Valid: ${flow.definition.name}` });
    return;
  }
  if (request.trace) {
    await trace({
      type: "initial",
      stack: runtime
        .getStack()
        .map((item) => snapshot(item.getState(), request.traceValues, item.getSensitiveFields())),
    });
    while (runtime.getState().status !== "completed" && runtime.getState().status !== "failed") {
      const active = runtime.getStack().at(-1);
      if (!active) throw new CliError("INTERNAL_ERROR", "Missing active invocation.");
      await trace({
        type: "step-start",
        invocationId: active.invocationId,
        flowName: active.flowName,
        ...(active.source === undefined ? {} : { source: active.source }),
        path: active.getState().nextStepPath,
      });
      const start = performance.now();
      const before = [...runtime.getStack()];
      const result = await runtime.step();
      const stack = runtime.getStack();
      await trace({
        type: "step-end",
        durationMs: performance.now() - start,
        event: result.event?.error
          ? {
              ...result.event,
              error: redactFailure(result.event.error, active.getSensitiveFields()),
            }
          : result.event,
        executed: snapshot(result.state, request.traceValues, active.getSensitiveFields()),
        returned: before
          .filter((item) => !stack.includes(item))
          .map((item) => snapshot(item.getState(), request.traceValues, item.getSensitiveFields())),
        stack: stack.map((item) =>
          snapshot(item.getState(), request.traceValues, item.getSensitiveFields()),
        ),
      });
    }
  } else await runtime.run();
  const state = runtime.getState();
  if (state.status === "failed") {
    if (!state.error) throw new CliError("INTERNAL_ERROR", "Missing runtime failure.");
    await send({
      type: "result",
      reply: {
        version: 1,
        ok: false,
        error: redactFailure(state.error, runtime.getSensitiveFields()),
      },
    });
    return;
  }
  const output = redactFields(state.output ?? {}, runtime.getSensitiveFields());
  if (request.json) await send({ type: "result", reply: success(output) });
  else
    await send({
      type: "result",
      reply: { version: 1, ok: true, result: null },
      text: inspect(output, {
        depth: 8,
        colors: false,
        getters: false,
        customInspect: false,
      }),
    });
}

process.once("message", (request: Request) => {
  // A pending Promise alone does not keep Node alive. The supervisor owns this lifetime.
  process.channel?.ref();
  void execute(request).catch(async (error: unknown) => {
    await send({ type: "result", reply: { version: 1, ok: false, error: failure(error) } });
  });
});
