import { homedir } from "node:os";
import { join } from "node:path";
import { createAiTools, createToolExecutionTools } from "soyori-ai";
import { createTokenTools } from "soyori-ai/tokens";
import type { RuntimeFunction } from "soyori-core";
import { createCliLocalModel } from "./local-model.js";

export function cliAiTools(
  progress: (message: string) => void,
  registry: () => Record<string, RuntimeFunction> = () => ({}),
  environment: Readonly<Record<string, string>> | (() => Record<string, string>) = {},
) {
  let lastProgress = "";
  const local = createCliLocalModel({
    cacheDir:
      process.env.SOYORI_MODEL_CACHE ||
      process.env.AGENT_PLAN_MODEL_CACHE ||
      join(homedir(), ".cache", "agent-plan", "models"),
    progress(message) {
      // Keep machine stdout clean; avoid printing every downloaded chunk.
      if (message !== lastProgress) {
        progress(message);
        lastProgress = message;
      }
    },
  });
  return {
    ...createTokenTools({
      cacheDir:
        process.env.SOYORI_MODEL_CACHE ||
        process.env.AGENT_PLAN_MODEL_CACHE ||
        join(homedir(), ".cache", "agent-plan", "models"),
    }),
    ...createAiTools({
      get environment() {
        return typeof environment === "function" ? environment() : environment;
      },
      registry,
      local: (input, signal) => local.generate(input, signal),
    }),
    ...createToolExecutionTools({ registry }),
  };
}
