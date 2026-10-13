import {
  createRuntime,
  describeTools,
  inspectFlow,
  type LoadedFlow,
  parseFlow,
  type Runtime,
  type RuntimeFunction,
  redactFailure,
  redactFields,
  toJsonValue,
  withoutSensitiveInitials,
} from "agent-plan-core";
import { ASSISTANT_TOOL_DEFINITIONS } from "./assistant-tool-definitions.ts";
import { executionSummary } from "./chat-execution.ts";
import type { Documentation } from "./documentation.ts";
import example from "./example.json" with { type: "json" };
import { readFlowFile } from "./flow-files.ts";
import { type FlowDocument, flowFilename, makeDocument, saveDocument } from "./library.ts";
import { loadLibraryGraph } from "./library-calls.ts";
import {
  changeFiles,
  filePath,
  listFiles,
  moveFile,
  newFile,
  readFile,
  writeFiles,
} from "./workspace-files.ts";

function string(value: unknown): string {
  if (typeof value !== "string") throw Error("ASSISTANT_INPUT: Expected string.");
  return value;
}
function integer(value: unknown, fallback: number, max: number) {
  const n = value === undefined ? fallback : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > max)
    throw Error("ASSISTANT_INPUT: Invalid offset/limit.");
  return n;
}
function page(content: string, input: Record<string, unknown>) {
  const offset = integer(input.offset, 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(input.limit, 12000, 20000);
  return {
    content: content.slice(offset, offset + limit),
    offset,
    total: content.length,
    truncated: offset + limit < content.length,
  };
}
/** Preserve JSON types for automated verification; the readable summary remains separately bounded. */
export function boundedFlowResult(output: unknown) {
  try {
    const result = toJsonValue(output);
    if (JSON.stringify(result).length > 16000)
      return { resultAvailable: false, resultUnavailable: "size-limit" };
    return { resultAvailable: true, result };
  } catch {
    return { resultAvailable: false, resultUnavailable: "not-json" };
  }
}
export function createAssistantTools(options: {
  signal: AbortSignal;
  docs?: Documentation;
  registry: Record<string, RuntimeFunction>;
  functions: (
    graph: LoadedFlow,
    source: () => string | undefined,
    signal: AbortSignal,
  ) => Record<string, RuntimeFunction> | Promise<Record<string, RuntimeFunction>>;
  changed: () => void;
  running?: boolean;
}) {
  const { signal } = options;
  const metadata = (f: Awaited<ReturnType<typeof listFiles>>[number]) => ({
    path: f.path,
    kind: f.kind,
    size: f.content.size,
    revision: `${f.id}:${f.updatedAt}`,
  });
  async function textFile(input: Record<string, unknown>) {
    const file = await readFile(string(input.path));
    if (file?.kind !== "file") throw Error("WORKSPACE_NOT_FOUND: File missing.");
    if (file.content.size > 2 * 1024 * 1024)
      throw Error("WORKSPACE_LIMIT: Text file exceeds 2 MiB.");
    const bytes = await file.content.arrayBuffer();
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (content.includes("\0")) throw Error("WORKSPACE_BINARY: Cannot read binary as text.");
    return { file, content };
  }
  async function graphFor(input: Record<string, unknown>) {
    const { file, content } = await textFile(input);
    const root = {
      id: file.id,
      path: file.path,
      updatedAt: file.updatedAt,
      flow: readFlowFile(content, file.path),
    };
    const documents: FlowDocument[] = [root];
    for (const f of await listFiles()) {
      if (f.id === file.id || f.kind !== "file" || !/\.(json|ya?ml)$/i.test(f.path)) continue;
      try {
        documents.push({
          id: f.id,
          path: f.path,
          updatedAt: f.updatedAt,
          flow: readFlowFile(await f.content.text(), f.path),
        });
      } catch {
        /* Ordinary files are not flows. */
      }
    }
    return { graph: loadLibraryGraph(root, documents), revision: metadata(file).revision };
  }
  const mutate = async (work: () => Promise<unknown>) => {
    signal.throwIfAborted();
    await work();
    options.changed();
    return { success: true };
  };
  const handlers: Record<string, RuntimeFunction> = {
    "flow.create": async (input) => {
      const directory = input.directory ? filePath(string(input.directory)) : "";
      const files = await listFiles();
      const names = new Set<string>();
      for (const f of files) {
        if (f.kind !== "file" || !/\.(json|ya?ml)$/i.test(f.path)) continue;
        try {
          names.add(readFlowFile(await f.content.text(), f.path).name);
        } catch {
          /* Ordinary files. */
        }
      }
      const requested = input.name === undefined ? "" : string(input.name).trim();
      let name = requested || "新流程";
      const pathFor = (name: string) => `${directory ? `${directory}/` : ""}${flowFilename(name)}`;
      if (!requested) {
        for (let n = 2; names.has(name) || files.some((f) => f.path === pathFor(name)); n++)
          name = `新流程 (${n})`;
      }
      const flow = {
        ...structuredClone(example),
        name,
        description: input.description === undefined ? "" : string(input.description),
      };
      let saved: FlowDocument | undefined;
      await mutate(async () => {
        saved = await saveDocument(makeDocument(parseFlow(flow)), directory);
      });
      const file = await readFile(saved!.path!);
      if (!file) throw Error("WORKSPACE_NOT_FOUND: Created file missing.");
      return { success: true, name, ...metadata(file) };
    },
    "project.docs": async (input) => {
      signal.throwIfAborted();
      const docs = options.docs;
      if (!docs) throw Error("DOC_UNAVAILABLE: Handbook is not configured.");
      if (input.path !== undefined) {
        const { entry, content, headings } = await docs.read(string(input.path));
        signal.throwIfAborted();
        let text = content;
        if (input.section !== undefined) {
          const section = string(input.section);
          const start = headings.findIndex((h) => h.id === section);
          if (start < 0)
            throw Error("DOC_SECTION_NOT_FOUND: Use a heading id returned by project.docs.");
          const end = headings.slice(start + 1).find((h) => h.level <= headings[start].level);
          text = content.slice(headings[start].offset, end?.offset);
        }
        const result = page(text, input);
        return {
          ...entry,
          version: docs.version,
          headings: headings.map(({ id, title, level }) => ({ id, title, level })),
          ...result,
          nextOffset: result.truncated ? result.offset + result.content.length : null,
        };
      }
      const results = await docs.search(input.query === undefined ? "" : string(input.query));
      signal.throwIfAborted();
      return results.map((entry) => ({ ...entry, version: docs.version }));
    },
    "project.tools": (input) => {
      if (input.name !== undefined) {
        const name = string(input.name);
        if (!Object.hasOwn(options.registry, name)) throw Error("TOOL_NOT_FOUND");
        return options.registry[name].definition;
      }
      return Object.entries(options.registry).map(([name, fn]) => ({
        name,
        ...(fn.definition?.description ? { description: fn.definition.description } : {}),
      }));
    },
    "workspace.list": async (input) => {
      const prefix = input.prefix ? filePath(string(input.prefix)) : "";
      const query = input.query === undefined ? "" : string(input.query).toLowerCase();
      const files = (await listFiles()).filter(
        (f) =>
          (!prefix || f.path === prefix || f.path.startsWith(`${prefix}/`)) &&
          f.path.toLowerCase().includes(query),
      );
      return {
        files: files.slice(0, 500).map(metadata),
        total: files.length,
        truncated: files.length > 500,
      };
    },
    "workspace.read": async (input) => {
      const { file, content } = await textFile(input);
      return { ...metadata(file), ...page(content, input) };
    },
    "workspace.write": async (input) => {
      const path = filePath(string(input.path)),
        content = string(input.content);
      if (new Blob([content]).size > 2 * 1024 * 1024)
        throw Error("WORKSPACE_LIMIT: Text exceeds 2 MiB.");
      const previous = await readFile(path);
      const revision = input.revision === undefined ? "" : string(input.revision);
      if (previous && (!revision || revision !== metadata(previous).revision))
        throw Error("WORKSPACE_CONFLICT: Read current revision before replacing.");
      if (!previous && revision) throw Error("WORKSPACE_CONFLICT: File removed.");
      const file = {
        ...newFile(path, new Blob([content])),
        ...(previous ? { id: previous.id } : {}),
      };
      if (previous)
        file.updatedAt = new Date(
          Math.max(Date.now(), Date.parse(previous.updatedAt) + 1),
        ).toISOString();
      await mutate(() => writeFiles([file], Boolean(previous), { [path]: revision }));
      return { success: true, ...metadata(file) };
    },
    "workspace.mkdir": (input) =>
      mutate(() => writeFiles([newFile(string(input.path), new Blob(), "directory")])),
    "workspace.move": (input) =>
      mutate(() => moveFile(string(input.path), string(input.destination))),
    "workspace.copy": (input) =>
      mutate(() => changeFiles("copy", [string(input.path)], string(input.directory))),
    "workspace.delete": (input) => mutate(() => changeFiles("delete", [string(input.path)])),
    "flow.inspect": async (input) => {
      const { graph, revision } = await graphFor(input);
      createRuntime(
        graph,
        {},
        { functions: await options.functions(graph, () => graph.source, signal) },
      );
      return { revision, ...inspectFlow(withoutSensitiveInitials(graph.definition)) };
    },
    "flow.run": async (input) => {
      if (options.running)
        throw Error("FLOW_BUSY: Nested flow.run is not supported; use ordinary subflow calls.");
      const literal = toJsonValue(input.inputs ?? {});
      if (!literal || typeof literal !== "object" || Array.isArray(literal))
        throw Error("ASSISTANT_INPUT: inputs must be an object.");
      const { graph, revision } = await graphFor(input);
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(
        () => controller.abort(Error("FLOW_TIMEOUT: exceeded 120 seconds")),
        120000,
      );
      const records: { flow: string; path: string; type: string; error?: unknown }[] = [];
      let runtime: Runtime | undefined;
      let steps = 0;
      const stack = () =>
        runtime?.getStack().map((frame) => ({
          ...(frame.source ? { source: frame.source } : {}),
          flowName: frame.flowName,
          invocationId: frame.invocationId,
          path: frame.getState().nextStepPath,
        })) ?? [];
      try {
        signal.throwIfAborted();
        runtime = createRuntime(graph, literal, {
          functions: await options.functions(
            graph,
            () => runtime?.getStack().at(-1)?.source,
            controller.signal,
          ),
        });
        while (!["completed", "failed"].includes(runtime.getState().status)) {
          controller.signal.throwIfAborted();
          if (++steps > 2000) throw Error("FLOW_LIMIT: exceeded 2000 steps");
          const active = runtime.getStack().at(-1);
          const { event } = await runtime.step();
          if (event && records.length < 100)
            records.push({
              flow: event.flowName,
              path: event.path,
              type: event.type,
              ...(event.error
                ? { error: redactFailure(event.error, active?.getSensitiveFields() ?? []) }
                : {}),
            });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        controller.signal.throwIfAborted();
        const state = runtime.getState();
        return {
          status: state.status,
          revision,
          output: executionSummary(
            redactFields(state.output ?? {}, runtime.getSensitiveFields()),
            16000,
          ),
          ...(state.status === "completed"
            ? boundedFlowResult(redactFields(state.output ?? {}, runtime.getSensitiveFields()))
            : { resultAvailable: false, resultUnavailable: "failed" }),
          ...(state.error
            ? { error: redactFailure(state.error, runtime.getSensitiveFields()) }
            : {}),
          stack: stack(),
          records,
          steps,
          truncated: steps > records.length,
        };
      } catch (cause) {
        const error = cause as {
          code?: string;
          message?: string;
          path?: string;
          flowName?: string;
          source?: string;
        };
        return {
          status: controller.signal.aborted ? "cancelled" : "failed",
          revision,
          resultAvailable: false,
          resultUnavailable: "failed",
          error: {
            code: error.code ?? "FLOW_RUN_ERROR",
            message: runtime?.getSensitiveFields().length
              ? "[sensitive error]"
              : (error.message ?? String(cause)),
            ...(error.path ? { path: error.path } : {}),
            ...(error.flowName ? { flowName: error.flowName } : {}),
            ...(error.source ? { source: error.source } : {}),
          },
          stack: stack(),
          records,
          steps,
          truncated: steps > records.length,
        };
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
    },
  };
  for (const [name, run] of Object.entries(handlers))
    handlers[name] = async (input) => {
      signal.throwIfAborted();
      return run(input);
    };
  return describeTools(handlers, ASSISTANT_TOOL_DEFINITIONS);
}
