import { describeTools, type ToolDefinition, toJsonValue } from "agent-plan-core";
import { type Storage, validateKey, validatePrefix } from "agent-plan-storage";
import { type ChatMessage, parseMessages, record, type ToolCall } from "./tool-calling.js";

const history = {
  name: "messages",
  valueType: "JSON",
  initial: "$messages",
  description: "已有上下文；未设置或 null 时从空数组开始。",
};
export const MEMORY_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  "memory.init": {
    name: "memory.init",
    description: "从 prefix/threadId 读取记忆，按需设置 system 并追加本轮 prompt；不写入存储。",
    inputs: [
      { name: "threadId", valueType: "string", required: true, initial: "$threadId" },
      { name: "prefix", valueType: "string", defaultValue: "memory" },
      { name: "system", valueType: "string", description: "省略时保留已有系统提示。" },
      {
        name: "prompt",
        valueType: "string",
        initial: "$chatIn",
        description: "可选的本轮用户文本。",
      },
    ],
    outputs: [{ name: "memory", valueType: "JSON" }],
  },
  "memory.save": {
    name: "memory.save",
    description: "将完整记忆消息数组保存到 prefix/threadId，覆盖该 key 的旧记忆。",
    inputs: [
      { name: "threadId", valueType: "string", required: true, initial: "$threadId" },
      { name: "prefix", valueType: "string", defaultValue: "memory" },
      { name: "memory", valueType: "JSON", required: true, initial: "$messages" },
    ],
    outputs: [],
  },
  "memory.setSystem": {
    name: "memory.setSystem",
    description: "设置上下文最前面的唯一 system 消息，替换已有系统提示，不重复追加。",
    inputs: [history, { name: "text", valueType: "string", required: true }],
    outputs: [{ name: "messages", valueType: "JSON" }],
  },
  "memory.addUser": {
    name: "memory.addUser",
    description: "将本轮用户文本加入上下文。",
    inputs: [history, { name: "input", valueType: "string", required: true, initial: "$chatIn" }],
    outputs: [{ name: "messages", valueType: "JSON" }],
  },
  "memory.addAssistant": {
    name: "memory.addAssistant",
    description: "将模型 message 加入上下文，保留内容块与工具请求。",
    inputs: [history, { name: "message", valueType: "JSON", required: true, initial: "$message" }],
    outputs: [{ name: "messages", valueType: "JSON" }],
  },
  "memory.addTools": {
    name: "memory.addTools",
    description: "将本批工具 results 转为消息并加入上下文，按调用 ID 对应请求。",
    inputs: [history, { name: "results", valueType: "JSON", required: true, initial: "$results" }],
    outputs: [{ name: "messages", valueType: "JSON" }],
  },
};
function context(value: unknown) {
  const messages =
    value == null || (Array.isArray(value) && !value.length) ? [] : parseMessages(value);
  const pending = new Map<string, ToolCall>();
  for (const message of messages) {
    if (message.role === "tool") {
      if (!pending.delete(message.toolCallId!))
        throw Error("MEMORY_INPUT: Tool result has no pending request.");
    } else {
      if (pending.size)
        throw Error("MEMORY_INPUT: Complete pending tool calls before adding another message.");
      for (const call of message.toolCalls ?? []) pending.set(call.id, call);
    }
  }
  return { messages, pending };
}
function complete(pending: Map<string, ToolCall>) {
  if (pending.size) throw Error("MEMORY_INPUT: Complete pending tool calls first.");
}
function memoryKey(prefix: unknown, threadId: unknown) {
  validatePrefix(prefix);
  validateKey(threadId);
  if (threadId.includes("/")) throw Error("MEMORY_INPUT: threadId must be a single key segment.");
  const key = prefix ? `${prefix.replace(/\/$/, "")}/${threadId}` : threadId;
  validateKey(key);
  return key;
}
export function createMemoryTools(storage?: Pick<Storage, "read" | "write">) {
  return describeTools(
    {
      "memory.init": async ({
        prefix = "memory",
        threadId,
        system,
        prompt,
      }: Record<string, unknown>) => {
        const key = memoryKey(prefix, threadId);
        if (!storage) throw Error("MEMORY_STORAGE: Storage is not configured.");
        if (system !== undefined && (typeof system !== "string" || !system.trim()))
          throw Error("MEMORY_INPUT: System prompt must be nonempty text.");
        if (prompt !== undefined && (typeof prompt !== "string" || !prompt.trim()))
          throw Error("MEMORY_INPUT: User prompt must be nonempty text.");
        const stored = await storage.read(key);
        const c = context(stored.found ? stored.value : undefined);
        complete(c.pending);
        let memory = c.messages;
        if (system !== undefined)
          memory = [
            { role: "system", content: system as string },
            ...memory.filter((m) => m.role !== "system"),
          ];
        if (prompt !== undefined) memory = [...memory, { role: "user", content: prompt as string }];
        return { memory };
      },
      "memory.save": async ({ prefix = "memory", threadId, memory }: Record<string, unknown>) => {
        const key = memoryKey(prefix, threadId);
        if (!storage) throw Error("MEMORY_STORAGE: Storage is not configured.");
        if (!Array.isArray(memory)) throw Error("MEMORY_INPUT: Expected a memory message array.");
        const c = context(memory);
        complete(c.pending);
        await storage.write(key, c.messages);
        return {};
      },
      "memory.setSystem": ({ messages, text }: Record<string, unknown>) => {
        const c = context(messages);
        if (typeof text !== "string" || !text.trim())
          throw Error("MEMORY_INPUT: System prompt must be nonempty text.");
        return {
          messages: [
            { role: "system", content: text },
            ...c.messages.filter((message) => message.role !== "system"),
          ],
        };
      },
      "memory.addUser": ({ messages, input }: Record<string, unknown>) => {
        const c = context(messages);
        complete(c.pending);
        if (typeof input !== "string" || !input.trim())
          throw Error("MEMORY_INPUT: User input must be nonempty text.");
        return { messages: [...c.messages, { role: "user", content: input }] };
      },
      "memory.addAssistant": ({ messages, message }: Record<string, unknown>) => {
        const c = context(messages);
        complete(c.pending);
        const parsed = parseMessages([message])[0]!;
        if (parsed.role !== "assistant")
          throw Error("MEMORY_INPUT: Expected an assistant message.");
        return { messages: [...c.messages, parsed] };
      },
      "memory.addTools": ({ messages, results }: Record<string, unknown>) => {
        const c = context(messages);
        if (!Array.isArray(results) || results.length !== c.pending.size)
          throw Error("MEMORY_INPUT: Provide one result for every pending tool call.");
        const byId = new Map<string, Record<string, unknown>>();
        for (const raw of results) {
          const r = toJsonValue(raw);
          if (
            !record(r) ||
            typeof r.id !== "string" ||
            typeof r.target !== "string" ||
            byId.has(r.id) ||
            c.pending.get(r.id)?.target !== r.target ||
            Object.keys(r).some((k) => !["id", "target", "result", "error"].includes(k)) ||
            Object.hasOwn(r, "result") === Object.hasOwn(r, "error")
          )
            throw Error("MEMORY_INPUT: Invalid or unmatched tool result.");
          if (
            Object.hasOwn(r, "error") &&
            (!record(r.error) ||
              typeof r.error.message !== "string" ||
              Object.keys(r.error).some((k) => k !== "message"))
          )
            throw Error("MEMORY_INPUT: Invalid tool error.");
          byId.set(r.id, r);
        }
        const added: ChatMessage[] = [...c.pending.keys()].map((id) => {
          const r = byId.get(id)!;
          return {
            role: "tool",
            toolCallId: id,
            content: JSON.stringify(Object.hasOwn(r, "error") ? { error: r.error } : r.result),
          };
        });
        return { messages: [...c.messages, ...added] };
      },
    },
    MEMORY_TOOL_DEFINITIONS,
  );
}
