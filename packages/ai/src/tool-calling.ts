import {
  describeTools,
  type RuntimeFunction,
  type ToolDefinition,
  toJsonValue,
  toolParameters,
} from "soyori-core";

export interface ToolCall {
  id: string;
  target: string;
  inputs: Record<string, unknown>;
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Record<string, unknown>[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}
export interface ResolvedTool {
  target: string;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  run: RuntimeFunction;
}
export interface ToolOptions {
  registry?: () => Record<string, RuntimeFunction>;
  signal?: AbortSignal;
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function toolNames(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    value.some((v) => typeof v !== "string" || !v.trim()) ||
    new Set(value).size !== value.length
  )
    throw Error("AI_TOOLS: tools must be a unique list of up to 32 call targets.");
  return value as string[];
}
// Stable across list reordering; provider names cannot contain dots or arbitrary Unicode.
export function wireName(target: string): string {
  let hash = 2166136261;
  for (const char of target) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return `tool_${target.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)}_${(hash >>> 0).toString(16)}`;
}
function valueSchema(type?: string): Record<string, unknown> {
  if (!type || type === "JSON") return {};
  const parts = type.split("|").map((p) => p.trim());
  if (parts.length > 1) return { anyOf: parts.map(valueSchema) };
  if (type.endsWith("[]")) return { type: "array", items: valueSchema(type.slice(0, -2)) };
  if (["string", "number", "integer", "boolean", "object", "null"].includes(type)) return { type };
  if (type === "messages") return { type: "object" };
  return { type: "string", enum: [type] };
}
export function resolveTools(value: unknown, options: ToolOptions): ResolvedTool[] {
  const registry = options.registry?.() ?? {};
  const resolved = toolNames(value).map((target) => {
    const run = Object.hasOwn(registry, target) ? registry[target] : undefined;
    if (!run?.definition) throw Error(`AI_TOOLS: Unknown tool or missing interface: ${target}.`);
    const fields = toolParameters(run.definition.inputs);
    return {
      target,
      name: wireName(target),
      run,
      ...(run.definition.description ? { description: run.definition.description } : {}),
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          fields.map((field) => [
            field.name,
            {
              ...valueSchema(field.valueType),
              ...(field.description ? { description: field.description } : {}),
            },
          ]),
        ),
        required: fields
          .filter((f) => f.required && f.defaultValue === undefined)
          .map((f) => f.name),
        additionalProperties: false,
      },
    };
  });
  if (new Set(resolved.map((t) => t.name)).size !== resolved.length)
    throw Error("AI_TOOLS: Tool name collision.");
  return resolved;
}
export function parseCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value) || value.length > 32)
    throw Error("AI_TOOL_CALLS: Expected at most 32 tool calls.");
  const calls = value.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.target !== "string" ||
      !item.target ||
      !record(item.inputs) ||
      Object.keys(item).some((k) => !["id", "target", "inputs"].includes(k))
    )
      throw Error("AI_TOOL_CALLS: Expected id, target and inputs.");
    return {
      id: item.id,
      target: item.target,
      inputs: toJsonValue(item.inputs) as Record<string, unknown>,
    };
  });
  if (new Set(calls.map((c) => c.id)).size !== calls.length)
    throw Error("AI_TOOL_CALLS: Duplicate call ID.");
  return calls;
}
export function parseMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || !value.length)
    throw Error("AI_INVALID_INPUT: Expected a non-empty message array.");
  return value.map((item) => {
    if (
      !record(item) ||
      !["system", "user", "assistant", "tool"].includes(String(item.role)) ||
      Object.keys(item).some((k) => !["role", "content", "toolCalls", "toolCallId"].includes(k))
    )
      throw Error("AI_INVALID_INPUT: Invalid message.");
    const role = item.role as ChatMessage["role"];
    if (
      typeof item.content !== "string" &&
      !(role === "assistant" && Array.isArray(item.content) && item.content.every(record))
    )
      throw Error("AI_INVALID_INPUT: Invalid message content.");
    if (
      (item.toolCalls !== undefined && role !== "assistant") ||
      (item.toolCallId !== undefined && role !== "tool") ||
      (role === "tool" && (typeof item.toolCallId !== "string" || !item.toolCallId))
    )
      throw Error("AI_INVALID_INPUT: Invalid tool message.");
    return {
      role,
      content: toJsonValue(item.content) as ChatMessage["content"],
      ...(item.toolCalls === undefined ? {} : { toolCalls: parseCalls(item.toolCalls) }),
      ...(role === "tool" ? { toolCallId: item.toolCallId as string } : {}),
    };
  });
}
function matches(value: unknown, schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some((s) => matches(value, s));
  if (Array.isArray(schema.enum)) return schema.enum.includes(value);
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.every((v) => matches(v, schema.items as Record<string, unknown>))
    );
  if (schema.type === "object") return record(value);
  if (schema.type === "integer") return Number.isInteger(value);
  if (schema.type === "null") return value === null;
  return !schema.type || typeof value === schema.type;
}
export const EXECUTION_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  "tools.execute": {
    name: "tools.execute",
    description: "按顺序执行模型请求，单次失败保留为错误结果。",
    inputs: [
      { name: "calls", valueType: "JSON", required: true, initial: "$toolCalls" },
      {
        type: "group",
        name: "高级设置",
        collapsed: true,
        fields: [
          {
            name: "tools",
            valueType: "string[]",
            placeholder: "留空不额外限制",
            description: "可选的调用名限制；留空不额外限制，填写列表后仅执行列表中的工具。",
          },
        ],
      },
    ],
    outputs: [{ name: "results", valueType: "JSON" }],
  },
};
export function createToolExecutionTools(options: ToolOptions) {
  let remaining = 64;
  return describeTools(
    {
      "tools.execute": async (raw: Record<string, unknown>) => {
        if (Object.keys(raw).some((k) => !["calls", "tools"].includes(k)))
          throw Error("AI_TOOLS: Unsupported execution parameter.");
        options.signal?.throwIfAborted();
        const calls = parseCalls(raw.calls);
        const allowed = resolveTools(
          raw.tools === undefined ? [...new Set(calls.map((call) => call.target))] : raw.tools,
          options,
        );
        // Preflight the whole allowlist before starting any side effects.
        const handlers = calls.map((call) => {
          const tool = allowed.find((t) => t.target === call.target);
          if (!tool) throw Error(`AI_TOOL_DENIED: ${call.target} is not allowed.`);
          return tool;
        });
        if (calls.length > remaining)
          throw Error("AI_TOOL_BUDGET: At most 64 tool executions per run.");
        remaining -= calls.length;
        const results = [];
        let stopped: string | undefined;
        for (const [index, call] of calls.entries()) {
          const tool = handlers[index]!;
          let outcome: { result: unknown } | { error: { message: string } };
          try {
            if (stopped || options.signal?.aborted) throw Error("Tool execution cancelled.");
            const properties = tool.parameters.properties as Record<
              string,
              Record<string, unknown>
            >;
            if (
              (tool.parameters.required as string[]).some((k) => !Object.hasOwn(call.inputs, k)) ||
              Object.entries(call.inputs).some(
                ([k, v]) => !Object.hasOwn(properties, k) || !matches(v, properties[k]!),
              )
            )
              throw Error("Invalid tool arguments.");
            const value = await tool.run(call.inputs);
            outcome = { result: value === undefined ? null : toJsonValue(value) };
          } catch (error) {
            // Do not leak arbitrary handler errors (credentials, request headers, etc.) to the model.
            if (options.signal?.aborted) stopped = "cancelled";
            if (error instanceof Error && /AI_(TOOL|MODEL)_BUDGET:/.test(error.message))
              stopped = "budget";
            outcome = {
              error: {
                message:
                  stopped === "budget"
                    ? "Tool execution budget exhausted."
                    : stopped
                      ? "Tool execution cancelled."
                      : "Tool execution failed or arguments/result were invalid.",
              },
            };
          }
          results.push({ id: call.id, target: call.target, ...outcome });
        }
        return { results };
      },
    },
    EXECUTION_TOOL_DEFINITIONS,
  );
}
