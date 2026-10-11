import { parseFlow } from "agent-plan-core";
import { BASIC_TOOL_DEFINITIONS } from "agent-plan-tools";
import { type AiSettings, assistantProvider } from "./ai-settings.ts";
import assistant from "./assistant.json" with { type: "json" };

export function assistantFlow(settings: AiSettings) {
  const flow = structuredClone(assistant);
  const provider = assistantProvider(settings);
  const connection = provider === "local" ? undefined : settings[provider];
  for (const step of [flow.steps[1], flow.steps[3].body![2]]) {
    step.target = `llm.${provider}`;
    step.inputs = {
      input: "$messages",
      maxTokens: provider === "local" ? 512 : 4096,
      tools:
        provider === "local"
          ? ["time.now", "web.search", "web.fetch"]
          : Object.keys(BASIC_TOOL_DEFINITIONS),
      ...(connection ? { model: connection.model.trim() } : {}),
    } as typeof step.inputs;
  }
  return parseFlow(flow);
}
