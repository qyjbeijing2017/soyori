import type { FlowDefinition, JsonValue } from "agent-plan-core";
export const tools: Record<string, Record<string, JsonValue>> = {
  "local.generate": { messages: "$messages", maxTokens: 128 },
  "openai.generate": { prompt: "$prompt", maxTokens: 512 },
  "anthropic.generate": { prompt: "$prompt", maxTokens: 512 },
  "storage.read": { key: "$memoryKey" },
  "storage.write": { key: "$memoryKey", value: "$memory" },
  "storage.delete": { key: "$memoryKey" },
  "storage.list": { prefix: "" },
  "tokens.count": { messages: "$messages", mode: "local" },
};

// Full accepted inputs, including optional and mutually exclusive alternatives.
const toolParameters: Record<string, readonly string[]> = {
  "local.generate": ["prompt", "messages", "model", "maxTokens", "temperature"],
  "openai.generate": ["prompt", "messages", "model", "maxTokens", "temperature"],
  "anthropic.generate": ["prompt", "messages", "model", "maxTokens", "temperature"],
  "storage.read": ["key"],
  "storage.write": ["key", "value"],
  "storage.delete": ["key"],
  "storage.list": ["prefix"],
  "tokens.count": ["text", "messages", "mode"],
};
export function callParameterNames(
  target: string,
  flow?: FlowDefinition,
): readonly string[] | null {
  if (Object.hasOwn(toolParameters, target)) return toolParameters[target];
  return flow ? Object.keys(flow.fields).filter((name) => flow.fields[name].input) : null;
}
export function restrictCallInputs(
  inputs: Record<string, JsonValue>,
  names: readonly string[],
): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(inputs).filter(([name]) => names.includes(name)));
}

const toolOutputs: Record<string, readonly string[]> = {
  "local.generate": ["text", "model", "content", "finishReason", "usage"],
  "openai.generate": ["text", "model", "content", "finishReason", "usage"],
  "anthropic.generate": ["text", "model", "content", "finishReason", "usage"],
  "storage.read": ["found", "value"],
  "storage.write": ["key"],
  "storage.delete": ["deleted"],
  "storage.list": ["keys"],
  "tokens.count": ["tokens", "method", "model"],
};
export function callOutputNames(target: string, flow?: FlowDefinition): readonly string[] {
  if (Object.hasOwn(toolOutputs, target)) return toolOutputs[target];
  return flow ? Object.keys(flow.fields).filter((name) => flow.fields[name].output) : [];
}
export function callOutputDestinations(
  step: { output?: string; outputs?: Record<string, string> },
  names: readonly string[],
): Record<string, `$${string}`> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      (step.output
        ? `${step.output}[${JSON.stringify(name)}]`
        : (step.outputs?.[name] ?? "")) as `$${string}`,
    ]),
  );
}
