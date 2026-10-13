import { describeTools, type ToolDefinition } from "soyori-core";
import type { Storage } from "./index.js";

export interface EnvironmentValue {
  value: string;
  sensitive: boolean;
}
export type Environment = Record<string, EnvironmentValue>;
export function validateEnvironmentName(name: unknown): asserts name is string {
  if (
    typeof name !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
    ["__proto__", "constructor", "prototype"].includes(name)
  )
    throw Error("ENV_NAME: Expected a variable name such as SEARCH_API_KEY.");
}
export function environmentKey(threadId?: string, fileId?: string) {
  if (threadId !== undefined && fileId !== undefined)
    throw Error("ENV_SCOPE: Choose one environment scope.");
  const id = fileId ?? threadId;
  if (id === undefined) return "env/global";
  if (!/^[a-z0-9_-]{1,80}$/.test(id))
    throw Error(
      fileId === undefined ? "ENV_THREAD: Invalid thread ID." : "ENV_FILE: Invalid file ID.",
    );
  return `env/${fileId === undefined ? "threads" : "files"}/${id}`;
}
export function readEnvironment(value: unknown): Environment {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("ENV_DATA: Invalid environment.");
  const entries = Object.entries(value).map(([name, raw]) => {
    validateEnvironmentName(name);
    const entry = raw as EnvironmentValue;
    if (
      !entry ||
      typeof entry.value !== "string" ||
      entry.value.length > 65536 ||
      typeof entry.sensitive !== "boolean"
    )
      throw Error("ENV_DATA: Invalid environment value.");
    return [name, { value: entry.value, sensitive: entry.sensitive }] as const;
  });
  if (entries.length > 200) throw Error("ENV_LIMIT: At most 200 variables per scope.");
  return Object.fromEntries(entries);
}
export async function loadEnvironment(
  storage: Storage,
  threadId?: string,
  fileId?: string,
): Promise<Environment> {
  const record = await storage.read(environmentKey(threadId, fileId));
  return record.found ? readEnvironment(record.value) : {};
}
export async function effectiveEnvironment(
  storage: Storage,
  threadId?: string,
  fileId?: string,
): Promise<Environment> {
  const global = await loadEnvironment(storage);
  return threadId === undefined && fileId === undefined
    ? global
    : { ...global, ...(await loadEnvironment(storage, threadId, fileId)) };
}
export async function saveEnvironment(
  storage: Storage,
  values: Environment,
  threadId?: string,
  fileId?: string,
) {
  await storage.write(environmentKey(threadId, fileId), readEnvironment(values));
}
export const ENV_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  "env.get": {
    name: "env.get",
    description:
      "读取当前运行环境：网页对话/文件设置覆盖全局；CLI 使用 --env、系统环境、全局配置。包含运行内临时覆盖。返回原值，不自动标记流程变量。",
    inputs: [{ name: "name", valueType: "string", required: true }],
    outputs: [
      { name: "found", valueType: "boolean" },
      { name: "value", description: "字符串原值；未设置时 null。" },
    ],
  },
};
export function createEnvironmentTools(values: Environment) {
  const environment = readEnvironment(values);
  return describeTools(
    {
      "env.get": ({ name }: Record<string, unknown>) => {
        validateEnvironmentName(name);
        return Object.hasOwn(environment, name)
          ? { found: true, value: environment[name].value }
          : { found: false, value: null };
      },
    },
    ENV_TOOL_DEFINITIONS,
  );
}

/** JSON configuration: string shorthand is sensitive by default; metadata form preserves the flag. */
export function parseEnvironmentFile(text: string): Environment {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw Error("ENV_FILE_LIMIT: Configuration exceeds 2 MiB.");
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("ENV_FILE_FORMAT: Expected a JSON environment object.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("ENV_FILE_FORMAT: Expected an object.");
  return readEnvironment(
    Object.fromEntries(
      Object.entries(data).map(([name, value]) => [
        name,
        typeof value === "string" ? { value, sensitive: true } : value,
      ]),
    ),
  );
}

export function createRuntimeEnvironment(
  initial: Environment,
  load: (path: string) => Promise<string>,
) {
  const values = readEnvironment(initial);
  const overrides: Environment = {};
  function apply(entries: Environment) {
    const next = readEnvironment({ ...values, ...entries });
    Object.assign(values, next);
    Object.assign(overrides, entries);
    return { success: true, names: Object.keys(entries) };
  }
  const tools = describeTools(
    {
      "env.get": ({ name }: Record<string, unknown>) => {
        validateEnvironmentName(name);
        return Object.hasOwn(values, name)
          ? { found: true, value: values[name].value }
          : { found: false, value: null };
      },
      "env.override": (input: Record<string, unknown>) => {
        if (Object.keys(input).some((key) => !["name", "value", "sensitive"].includes(key)))
          throw Error("ENV_INPUT: Unsupported argument.");
        validateEnvironmentName(input.name);
        const previous = Object.hasOwn(values, input.name) ? values[input.name] : undefined;
        if (previous?.sensitive && input.sensitive === false)
          throw Error("ENV_SENSITIVE: Cannot downgrade a sensitive value.");
        return apply(
          readEnvironment({
            [input.name]: {
              value: input.value,
              sensitive: input.sensitive ?? previous?.sensitive ?? true,
            },
          }),
        );
      },
      "env.load": async (input: Record<string, unknown>) => {
        if (
          Object.keys(input).some((key) => key !== "path") ||
          typeof input.path !== "string" ||
          !input.path
        )
          throw Error("ENV_INPUT: Expected configuration path.");
        const entries = parseEnvironmentFile(await load(input.path));
        for (const [name, entry] of Object.entries(entries))
          if (values[name]?.sensitive) entry.sensitive = true;
        return apply(entries);
      },
    },
    ENV_TOOL_DEFINITIONS,
  );
  return {
    values,
    overrides,
    tools,
    strings: () =>
      Object.fromEntries(Object.entries(values).map(([name, entry]) => [name, entry.value])),
  };
}
ENV_TOOL_DEFINITIONS["env.override"] = {
  name: "env.override",
  description: "临时覆盖当前运行环境，后续工具及子流程生效，不持久保存；返回变量名，不回传值。",
  inputs: [
    { name: "name", valueType: "string", required: true },
    { name: "value", valueType: "string", required: true },
    { name: "sensitive", valueType: "boolean" },
  ],
  outputs: [],
  returns: { valueType: "JSON" },
};
ENV_TOOL_DEFINITIONS["env.load"] = {
  name: "env.load",
  description:
    "按调用流程的相对路径加载 JSON 环境配置，临时覆盖本次运行；字符串简写默认敏感，不返回配置值。",
  inputs: [{ name: "path", valueType: "string", required: true }],
  outputs: [],
  returns: { valueType: "JSON" },
};
