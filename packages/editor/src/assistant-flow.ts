import { parseFlow } from "soyori-core";
import { BASIC_TOOL_DEFINITIONS } from "soyori-tools";
import { type AiSettings, assistantProvider } from "./ai-settings.ts";
import assistant from "./assistant.json" with { type: "json" };
import { ASSISTANT_TOOL_DEFINITIONS } from "./assistant-tool-definitions.ts";

export function assistantFlow(settings: AiSettings) {
  const flow = structuredClone(assistant);
  const provider = assistantProvider(settings);
  for (const step of [flow.steps[1], flow.steps[3].body![2]]) {
    step.target = settings.assistantProvider === "auto" ? "llm.auto" : `llm.${provider}`;
    step.inputs = {
      input: "$messages",
      ...(settings.assistantProvider === "auto"
        ? {}
        : { maxTokens: provider === "local" ? 512 : 4096 }),
      tools:
        provider === "local"
          ? [
              "flow.create",
              "workspace.list",
              "project.tools",
              "project.docs",
              "time.now",
              "web.search",
              "web.fetch",
            ]
          : [
              ...Object.keys(BASIC_TOOL_DEFINITIONS),
              ...Object.keys(ASSISTANT_TOOL_DEFINITIONS),
              "env.inspect",
              "env.list",
              "env.set",
            ],
    } as typeof step.inputs;
  }
  return parseFlow(flow);
}
