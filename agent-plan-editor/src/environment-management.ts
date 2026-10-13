import { describeTools, type RuntimeFunction } from "agent-plan-core";
import {
  loadEnvironment,
  readEnvironment,
  validateEnvironmentName,
} from "agent-plan-storage/environment";
import {
  environmentStorage,
  flushEnvironmentWrites,
  persistEnvironment,
} from "./environment-store.ts";

export interface EnvironmentContext {
  threadId?: string;
  fileId?: string;
}

/** Model-visible registry excludes the raw execution-only reader. */
export function assistantRegistry(registry: Record<string, RuntimeFunction>) {
  return Object.fromEntries(
    Object.entries(registry).filter(
      ([name]) => !["env.get", "env.override", "env.load"].includes(name),
    ),
  );
}

export function createEnvironmentManagementTools(context: EnvironmentContext, signal: AbortSignal) {
  // Serialize management requests, including concurrent model calls, to avoid lost updates.
  let pending: Promise<unknown> = Promise.resolve();
  const run = (work: () => Promise<unknown>) => {
    const task = pending.catch(() => {}).then(work);
    pending = task;
    return task;
  };
  async function read() {
    signal.throwIfAborted();
    await flushEnvironmentWrites();
    const global = await loadEnvironment(environmentStorage);
    const local =
      context.threadId || context.fileId
        ? await loadEnvironment(environmentStorage, context.threadId, context.fileId)
        : {};
    return { global, local, effective: { ...global, ...local } };
  }
  function inputs(input: Record<string, unknown>, allowed: string[]) {
    if (Object.keys(input).some((key) => !allowed.includes(key)))
      throw Error("ENV_INPUT: Unsupported argument; scope is selected by the host.");
  }
  function status(name: string, data: Awaited<ReturnType<typeof read>>) {
    const entry = Object.hasOwn(data.effective, name) ? data.effective[name] : undefined;
    return {
      name,
      found: Boolean(entry),
      status: !entry ? "missing" : entry.value === "" ? "empty" : "set",
      ...(entry
        ? {
            sensitive: entry.sensitive,
            source: Object.hasOwn(data.local, name)
              ? context.threadId
                ? "thread"
                : "file"
              : "global",
            ...(!entry.sensitive ? { value: entry.value } : {}),
          }
        : {}),
    };
  }
  return describeTools(
    {
      "env.inspect": (input) =>
        run(async () => {
          inputs(input, ["name"]);
          validateEnvironmentName(input.name);
          return status(input.name, await read());
        }),
      "env.list": (input) =>
        run(async () => {
          inputs(input, []);
          const data = await read();
          return {
            variables: Object.keys(data.effective)
              .sort()
              .map((name) => status(name, data)),
          };
        }),
      "env.set": (input) =>
        run(async () => {
          inputs(input, ["name", "value", "sensitive"]);
          if (!context.threadId || context.fileId)
            throw Error("ENV_SCOPE: Writes require the current conversation.");
          validateEnvironmentName(input.name);
          const data = await read();
          const previous = Object.hasOwn(data.effective, input.name)
            ? data.effective[input.name]
            : undefined;
          const sensitive = input.sensitive ?? previous?.sensitive ?? true;
          if (previous?.sensitive && sensitive === false)
            throw Error("ENV_SENSITIVE: Cannot remove sensitivity through assistant tools.");
          const next = readEnvironment({
            ...data.local,
            [input.name]: { value: input.value, sensitive },
          });
          signal.throwIfAborted();
          await persistEnvironment(next, context.threadId);
          globalThis.dispatchEvent?.(new Event("agent-plan-environment-changed"));
          return {
            success: true,
            ...status(input.name, { ...data, local: next, effective: { ...data.global, ...next } }),
          };
        }),
    },
    {
      "env.inspect": {
        name: "env.inspect",
        description:
          "Inspect the current effective environment variable. Sensitive values return only missing/empty/set status, never their value.",
        inputs: [{ name: "name", valueType: "string", required: true }],
        outputs: [],
        returns: { valueType: "JSON" },
      },
      "env.list": {
        name: "env.list",
        description:
          "List effective environment names and safe status; sensitive values are omitted.",
        inputs: [],
        outputs: [],
        returns: { valueType: "JSON" },
      },
      "env.set": {
        name: "env.set",
        description:
          "Set only the current conversation environment override. New values are sensitive by default; existing sensitive values cannot be downgraded. Result never echoes sensitive values.",
        inputs: [
          { name: "name", valueType: "string", required: true },
          { name: "value", valueType: "string", required: true },
          { name: "sensitive", valueType: "boolean" },
        ],
        outputs: [],
        returns: { valueType: "JSON" },
      },
    },
  );
}
