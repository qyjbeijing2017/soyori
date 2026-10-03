import type { FlowDefinition } from "agent-plan-core";
import { stringify } from "yaml";
import { formatState } from "./format-state.ts";

/** Convert output for display and transcript storage without parsing strings again. */
export function formatChatOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return stringify(JSON.parse(formatState(value)), { lineWidth: 0 }).trimEnd();
}

export function canChat(flow: FlowDefinition) {
  return Boolean(flow.fields.chatOut?.output);
}

/** Adapt existing conversations without deleting their steps or user variables. */
export function upgradeDefaultChat(flow: FlowDefinition): FlowDefinition {
  if (canChat(flow)) return flow;
  const legacyText = flow.fields.text?.input && flow.fields.text?.output;
  const legacyPair = flow.fields.prompt?.input && flow.fields.answer?.output;
  if (!legacyText && !legacyPair) return flow;
  const enabled = enableChat(flow);
  return {
    ...enabled,
    steps: [
      { type: "set", field: legacyText ? "$text" : "$prompt", value: "$chatIn" },
      ...flow.steps,
      { type: "set", field: "$chatOut", value: legacyText ? "$text" : "$answer" },
    ],
  };
}

export function enableChat(flow: FlowDefinition): FlowDefinition {
  if (canChat(flow) && flow.fields.chatIn?.input && flow.fields.memoryKey?.input) return flow;
  return {
    ...flow,
    fields: {
      ...flow.fields,
      chatIn: { ...flow.fields.chatIn, input: true },
      memoryKey: { ...flow.fields.memoryKey, input: true },
      chatOut: { ...flow.fields.chatOut, output: true },
    },
  };
}
