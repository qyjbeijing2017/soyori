import type { PreTrainedTokenizer } from "@huggingface/transformers";
import { LOCAL_MODEL, parseInput } from "./index.js";

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
        return AutoTokenizer.from_pretrained(LOCAL_MODEL);
      })();
      tokenizer.catch(() => {
        tokenizer = undefined;
      });
    }
    return tokenizer;
  }
  return {
    "tokens.count": async (input: Record<string, unknown>) => {
      for (const key of Object.keys(input))
        if (!["text", "messages", "mode"].includes(key))
          throw new Error(`TOKENS_INPUT: Unsupported parameter ${key}.`);
      if ((input.text !== undefined) === (input.messages !== undefined))
        throw new Error("TOKENS_INPUT: Provide text or messages.");
      if (input.text !== undefined && typeof input.text !== "string")
        throw new Error("TOKENS_INPUT: text must be a string.");
      const messages =
        input.messages === undefined
          ? undefined
          : parseInput({ messages: input.messages }).messages;
      const mode = input.mode ?? "local";
      if (mode === "estimate") {
        const text = messages ? messages.map((m) => m.content).join("") : (input.text as string);
        // Explicit heuristic, not a provider tokenizer or billing count.
        const tokens =
          new TextEncoder().encode(text).length + (messages ? messages.length * 16 + 16 : 0);
        return { tokens, method: "estimate", model: null };
      }
      if (mode !== "local") throw new Error("TOKENS_INPUT: mode must be local or estimate.");
      const t = await load();
      options.beforeLoad?.();
      if (messages) {
        const prompt = t.apply_chat_template(messages, {
          tokenize: false,
          add_generation_prompt: true,
        });
        if (typeof prompt !== "string") throw new Error("TOKENS_TEMPLATE: Invalid chat template.");
        return { tokens: t(prompt).input_ids.size, method: "tokenizer", model: LOCAL_MODEL };
      }
      return {
        tokens: t(input.text as string, { add_special_tokens: false }).input_ids.size,
        method: "tokenizer",
        model: LOCAL_MODEL,
      };
    },
  };
}
