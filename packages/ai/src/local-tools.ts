import type { GenerateInput, GenerateResult } from "./index.js";
import { parseCalls, record, wireName } from "./tool-calling.js";

/** Qwen's official Hermes template owns tool instructions and history formatting. */
export function localMessages(input: GenerateInput) {
  return input.messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    ...(m.toolCalls?.length
      ? {
          tool_calls: m.toolCalls.map((c) => ({
            type: "function",
            function: { name: wireName(c.target), arguments: c.inputs },
          })),
        }
      : {}),
  }));
}
export function localTemplateOptions(input: GenerateInput) {
  return {
    tokenize: false as const,
    add_generation_prompt: true,
    enable_thinking: false,
    ...(input.toolDefinitions?.length
      ? {
          tools: input.toolDefinitions.map(({ name, description, parameters }) => ({
            type: "function",
            function: { name, description, parameters },
          })),
        }
      : {}),
  };
}
export function localResult(raw: string, input: GenerateInput): GenerateResult {
  const text = raw.replace(/<\|(?:im_end|endoftext)\|>/g, "").trim();
  const blocks = [...text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)];
  const content = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
  if (content.includes("<tool_call>") || content.includes("</tool_call>"))
    throw Error("AI_TOOL_CALLS: Incomplete local tool block.");
  const calls = parseCalls(
    blocks.map((block) => {
      let c: unknown;
      try {
        c = JSON.parse(block[1]);
      } catch {
        throw Error("AI_TOOL_CALLS: Invalid local tool JSON.");
      }
      const tool = record(c) ? input.toolDefinitions?.find((t) => t.name === c.name) : undefined;
      if (!tool || !record(c)) throw Error("AI_TOOL_CALLS: Unknown local tool.");
      return { id: `call_${crypto.randomUUID()}`, target: tool.target, inputs: c.arguments };
    }),
  );
  return {
    result: content,
    finishReason: null,
    usage: null,
    toolCalls: calls,
    message: { role: "assistant", content, ...(calls.length ? { toolCalls: calls } : {}) },
  };
}
