import type { FlowDefinition } from "soyori-core";
import { fieldDefinitions, withFieldDefinitions } from "soyori-core";
import { stringify } from "yaml";
import { formatState } from "./format-state.ts";

/** Convert output for display and transcript storage without parsing strings again. */
export function formatChatOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return stringify(JSON.parse(formatState(value)), { lineWidth: 0 }).trimEnd();
}

export function canChat(flow: FlowDefinition) {
  return Boolean(fieldDefinitions(flow.fields).chatOut?.output);
}

/** Adapt existing conversations without deleting their steps or user variables. */
export function upgradeDefaultChat(flow: FlowDefinition): FlowDefinition {
  if (canChat(flow)) return flow;
  const legacyText =
    fieldDefinitions(flow.fields).text?.input && fieldDefinitions(flow.fields).text?.output;
  const legacyPair =
    fieldDefinitions(flow.fields).prompt?.input && fieldDefinitions(flow.fields).answer?.output;
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
  if (
    canChat(flow) &&
    fieldDefinitions(flow.fields).chatIn?.input &&
    fieldDefinitions(flow.fields).threadId?.input
  )
    return flow;
  return {
    ...flow,
    fields: withFieldDefinitions(flow.fields, {
      ...fieldDefinitions(flow.fields),
      chatIn: { ...fieldDefinitions(flow.fields).chatIn, input: true },
      threadId: { ...fieldDefinitions(flow.fields).threadId, input: true },
      chatOut: { ...fieldDefinitions(flow.fields).chatOut, output: true },
    }),
  };
}
