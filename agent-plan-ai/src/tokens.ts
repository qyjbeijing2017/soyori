import { describeTools } from "agent-plan-core";
import { TOKEN_TOOL_DEFINITIONS } from "./definitions.js";

export { TOKEN_TOOL_DEFINITIONS } from "./definitions.js";

import type { PreTrainedTokenizer } from "@huggingface/transformers";
import { LOCAL_REVISION } from "./definitions.js";
import { LOCAL_MODEL, parseInput } from "./index.js";
import { localMessages, localTemplateOptions } from "./local-tools.js";

export function createTokenTools(
  options: { cacheDir?: string; browser?: boolean; beforeLoad?: () => void } = {},
) {
  let tokenizer: Promise<PreTrainedTokenizer> | undefined;
  async function load() {
    options.beforeLoad?.();
    if (!tokenizer) {
      tokenizer = (async () => {
        const { AutoTokenizer, env } = await import("@huggingface/transformers");
        if (options.cacheDir) env.cacheDir = options.cacheDir;
        if (options.browser) env.allowLocalModels = false;
        return AutoTokenizer.from_pretrained(LOCAL_MODEL, { revision: LOCAL_REVISION });
      })();
      tokenizer.catch(() => {
        tokenizer = undefined;
      });
    }
    return tokenizer;
  }
  return describeTools(
    {
      "tokens.count": async (input: Record<string, unknown>) => {
        for (const key of Object.keys(input))
          if (!["input", "mode"].includes(key))
            throw new Error(`TOKENS_INPUT: Unsupported parameter ${key}.`);
        if (typeof input.input !== "string" && !Array.isArray(input.input))
          throw new Error("TOKENS_INPUT: input must be a string or a message array.");
        const messages = Array.isArray(input.input)
          ? parseInput({ input: input.input }).messages
          : undefined;
        const mode = input.mode ?? "local";
        if (mode === "estimate") {
          const text = messages ? JSON.stringify(messages) : (input.input as string);
          // Explicit heuristic, not a provider tokenizer or billing count.
          const tokens =
            new TextEncoder().encode(text).length + (messages ? messages.length * 16 + 16 : 0);
          return { tokens, method: "estimate", model: null };
        }
        if (mode !== "local") throw new Error("TOKENS_INPUT: mode must be local or estimate.");
        const t = await load();
        options.beforeLoad?.();
        if (messages) {
          const input = { messages, maxTokens: 1 };
          const prompt = t.apply_chat_template(localMessages(input), localTemplateOptions(input));
          if (typeof prompt !== "string")
            throw new Error("TOKENS_TEMPLATE: Invalid chat template.");
          return { tokens: t(prompt).input_ids.size, method: "tokenizer", model: LOCAL_MODEL };
        }
        return {
          tokens: t(input.input as string, { add_special_tokens: false }).input_ids.size,
          method: "tokenizer",
          model: LOCAL_MODEL,
        };
      },
    },
    TOKEN_TOOL_DEFINITIONS,
  );
}
