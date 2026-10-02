export const LOCAL_MODEL = "LiquidAI/LFM2.5-350M-ONNX";
export const AI_TOOLS = ["openai.generate", "anthropic.generate", "local.generate"] as const;
export type Provider = "openai" | "anthropic";
export interface Connection {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  model?: string | undefined;
}
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface GenerateInput {
  messages: Message[];
  model?: string;
  maxTokens: number;
  temperature?: number;
}
export interface GenerateResult {
  text: string;
  model: string;
  content: unknown;
  finishReason: string | null;
  usage: unknown;
}
export type LocalGenerate = (input: GenerateInput, signal?: AbortSignal) => Promise<GenerateResult>;
export interface AiOptions {
  connection: (provider: Provider) => Connection;
  local: LocalGenerate;
  signal?: AbortSignal;
  timeoutMs?: number;
  browser?: boolean;
}

export function parseInput(input: Record<string, unknown>, local = false): GenerateInput {
  const allowed = new Set(["prompt", "messages", "model", "maxTokens", "temperature"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`AI_INVALID_INPUT: Unsupported parameter ${key}.`);
  }
  if ((input.prompt !== undefined) === (input.messages !== undefined))
    throw new Error("AI_INVALID_INPUT: Provide either prompt or messages.");
  let messages: Message[];
  if (input.prompt !== undefined) {
    if (typeof input.prompt !== "string" || !input.prompt.trim())
      throw new Error("AI_INVALID_INPUT: prompt must be non-empty text.");
    messages = [{ role: "user", content: input.prompt }];
  } else {
    if (!Array.isArray(input.messages) || input.messages.length === 0)
      throw new Error("AI_INVALID_INPUT: messages must be a non-empty array.");
    messages = input.messages.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new Error("AI_INVALID_INPUT: Invalid message.");
      const m = item as Record<string, unknown>;
      if (
        !(["system", "user", "assistant"] as unknown[]).includes(m.role) ||
        typeof m.content !== "string" ||
        Object.keys(m).some((key) => key !== "role" && key !== "content")
      )
        throw new Error(
          "AI_INVALID_INPUT: Only system/user/assistant text messages are supported.",
        );
      return { role: m.role as Message["role"], content: m.content };
    });
  }
  if (input.model !== undefined && (typeof input.model !== "string" || !input.model.trim()))
    throw new Error("AI_INVALID_INPUT: model must be non-empty text.");
  if (local && input.model !== undefined && input.model !== LOCAL_MODEL)
    throw new Error(`AI_INVALID_INPUT: Local inference currently supports ${LOCAL_MODEL} only.`);
  const maxTokens = input.maxTokens ?? (local ? 128 : 512);
  if (
    typeof maxTokens !== "number" ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > (local ? 512 : 32768)
  )
    throw new Error(
      `AI_INVALID_INPUT: maxTokens must be an integer from 1 to ${local ? 512 : 32768}.`,
    );
  if (
    input.temperature !== undefined &&
    (typeof input.temperature !== "number" ||
      !Number.isFinite(input.temperature) ||
      input.temperature < 0 ||
      input.temperature > 1)
  )
    throw new Error("AI_INVALID_INPUT: temperature must be between 0 and 1.");
  return {
    messages,
    maxTokens,
    ...(input.model === undefined ? {} : { model: input.model as string }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature as number }),
  };
}

export function createAiTools(options: AiOptions) {
  const remote =
    (provider: Provider) =>
    async (raw: Record<string, unknown>): Promise<GenerateResult> => {
      const input = parseInput(raw);
      const config = options.connection(provider);
      if (!config.apiKey?.trim())
        throw new Error(`AI_CONFIG: Configure ${provider} API key in the host settings.`);
      const model = input.model ?? config.model;
      if (!model?.trim()) throw new Error(`AI_CONFIG: Specify a ${provider} model.`);
      if (config.baseURL) {
        let url: URL;
        try {
          url = new URL(config.baseURL);
        } catch {
          throw new Error("AI_CONFIG: Invalid service URL.");
        }
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error(
            "AI_CONFIG: Service URL must be HTTP(S), without credentials, query or fragment.",
          );
      }
      const signal = AbortSignal.any([
        AbortSignal.timeout(options.timeoutMs ?? 120_000),
        ...(options.signal ? [options.signal] : []),
      ]);
      try {
        signal.throwIfAborted();
        const common = {
          model,
          apiKey: config.apiKey,
          maxTokens: input.maxTokens,
          maxRetries: 0,
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        };
        const llm =
          provider === "openai"
            ? new (await import("@langchain/openai")).ChatOpenAI({
                ...common,
                configuration: {
                  ...(config.baseURL ? { baseURL: config.baseURL } : {}),
                  dangerouslyAllowBrowser: options.browser === true,
                },
              })
            : new (await import("@langchain/anthropic")).ChatAnthropic({
                ...common,
                clientOptions: {
                  ...(config.baseURL ? { baseURL: config.baseURL } : {}),
                  dangerouslyAllowBrowser: options.browser === true,
                },
              });
        const response = await llm.invoke(
          input.messages.map(({ role, content }) => [role, content] as [Message["role"], string]),
          { signal },
        );
        return {
          text: response.text,
          model,
          content: response.content,
          finishReason:
            String(
              response.response_metadata.finish_reason ??
                response.response_metadata.stop_reason ??
                "",
            ) || null,
          usage: response.usage_metadata ?? null,
        };
      } catch (error) {
        if (signal.aborted) throw new Error("AI_CANCELLED: Model request cancelled or timed out.");
        // SDK errors may contain credentials, request headers, URLs or provider-echoed prompts.
        const status =
          error && typeof error === "object" && "status" in error ? error.status : undefined;
        throw new Error(
          `AI_REQUEST_FAILED: ${provider}${typeof status === "number" ? ` HTTP ${status}` : " network or SDK error"}. Check model, credentials, service URL and browser CORS support.`,
        );
      }
    };
  return {
    "openai.generate": remote("openai"),
    "anthropic.generate": remote("anthropic"),
    "local.generate": (raw: Record<string, unknown>) =>
      options.local(parseInput(raw, true), options.signal),
  };
}
