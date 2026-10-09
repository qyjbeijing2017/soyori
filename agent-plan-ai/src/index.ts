import { describeTools } from "agent-plan-core";
import { AI_TOOL_DEFINITIONS } from "./definitions.js";

export { AI_TOOL_DEFINITIONS, TOKEN_TOOL_DEFINITIONS } from "./definitions.js";

import { BASE_URLS, LOCAL_MAX_TOKENS, LOCAL_MODEL, REMOTE_MAX_TOKENS } from "./definitions.js";

export { LOCAL_MODEL } from "./definitions.js";
export const AI_TOOLS = ["llm.openai", "llm.anthropic", "llm.local"] as const;
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
export interface GenerateInput extends Connection {
  messages: Message[];
  model?: string;
  maxTokens: number;
  temperature?: number;
  outputFormat?: "text" | "json";
  jsonSchema?: Record<string, unknown>;
}
export interface GenerateResult {
  result: unknown;
  finishReason: string | null;
  usage: unknown;
}
export type LocalGenerate = (input: GenerateInput, signal?: AbortSignal) => Promise<GenerateResult>;
export interface AiOptions {
  local: LocalGenerate;
  signal?: AbortSignal;
  timeoutMs?: number;
  browser?: boolean;
}

export function parseInput(input: Record<string, unknown>, local = false): GenerateInput {
  const allowed = new Set(["input", "model", "maxTokens", "temperature"]);
  if (!local)
    for (const key of ["apiKey", "baseURL", "outputFormat", "jsonSchema"]) allowed.add(key);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`AI_INVALID_INPUT: Unsupported parameter ${key}.`);
  }
  for (const key of ["apiKey", "baseURL"]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || !input[key].trim()))
      throw new Error(`AI_INVALID_INPUT: ${key} must be non-empty text.`);
  }
  if (
    input.outputFormat !== undefined &&
    input.outputFormat !== "text" &&
    input.outputFormat !== "json"
  )
    throw new Error("AI_INVALID_INPUT: outputFormat must be text or json.");
  if (input.outputFormat === "json") {
    if (
      !input.jsonSchema ||
      typeof input.jsonSchema !== "object" ||
      Array.isArray(input.jsonSchema)
    )
      throw new Error("AI_INVALID_INPUT: JSON output requires a jsonSchema object.");
  } else if (input.jsonSchema !== undefined) {
    throw new Error("AI_INVALID_INPUT: jsonSchema requires outputFormat json.");
  }
  let messages: Message[];
  if (typeof input.input === "string") {
    if (!input.input.trim()) throw new Error("AI_INVALID_INPUT: input must be non-empty text.");
    messages = [{ role: "user", content: input.input }];
  } else {
    if (!Array.isArray(input.input) || input.input.length === 0)
      throw new Error(
        "AI_INVALID_INPUT: input must be non-empty text or a non-empty message array.",
      );
    messages = input.input.map((item: unknown) => {
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
  const maxTokens = input.maxTokens ?? (local ? LOCAL_MAX_TOKENS : REMOTE_MAX_TOKENS);
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
    ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey as string }),
    ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL as string }),
    ...(input.outputFormat === undefined
      ? {}
      : { outputFormat: input.outputFormat as "text" | "json" }),
    ...(input.jsonSchema === undefined
      ? {}
      : { jsonSchema: input.jsonSchema as Record<string, unknown> }),
  };
}

export function createAiTools(options: AiOptions) {
  const remote =
    (provider: Provider) =>
    async (raw: Record<string, unknown>): Promise<GenerateResult> => {
      const input = parseInput(raw);
      const config = input;
      if (!config.apiKey?.trim())
        throw new Error(`AI_CONFIG: Specify ${provider} apiKey in the call inputs.`);
      const model = input.model;
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
                  baseURL: config.baseURL ?? BASE_URLS.openai,
                  dangerouslyAllowBrowser: options.browser === true,
                },
              })
            : new (await import("@langchain/anthropic")).ChatAnthropic({
                ...common,
                clientOptions: {
                  baseURL: config.baseURL ?? BASE_URLS.anthropic,
                  dangerouslyAllowBrowser: options.browser === true,
                },
              });
        const response = await llm.invoke(
          input.messages.map(({ role, content }) => [role, content] as [Message["role"], string]),
          {
            signal,
            ...(input.outputFormat === "json"
              ? provider === "openai"
                ? {
                    response_format: {
                      type: "json_schema" as const,
                      json_schema: { name: "result", strict: true, schema: input.jsonSchema! },
                    },
                  }
                : {
                    outputConfig: {
                      format: { type: "json_schema" as const, schema: input.jsonSchema! },
                    },
                  }
              : {}),
          },
        );
        let json: unknown = null;
        if (input.outputFormat === "json") {
          const reason =
            response.response_metadata.finish_reason ?? response.response_metadata.stop_reason;
          if (reason !== "stop" && reason !== "end_turn")
            throw new Error("AI_JSON_OUTPUT: Model did not complete a JSON response.");
          try {
            json = JSON.parse(response.text);
          } catch {
            throw new Error("AI_JSON_OUTPUT: Model returned invalid JSON.");
          }
        }
        return {
          result: input.outputFormat === "json" ? json : response.text,
          finishReason:
            String(
              response.response_metadata.finish_reason ??
                response.response_metadata.stop_reason ??
                "",
            ) || null,
          usage: response.usage_metadata ?? null,
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("AI_JSON_OUTPUT:")) throw error;
        if (signal.aborted) throw new Error("AI_CANCELLED: Model request cancelled or timed out.");
        if (
          input.outputFormat === "json" &&
          error instanceof Error &&
          ["SyntaxError", "LengthFinishReasonError", "ContentFilterFinishReasonError"].includes(
            error.constructor.name,
          )
        )
          throw new Error("AI_JSON_OUTPUT: Model returned invalid, refused or incomplete JSON.");
        // SDK errors may contain credentials, request headers, URLs or provider-echoed prompts.
        const status =
          error && typeof error === "object" && "status" in error ? error.status : undefined;
        throw new Error(
          `AI_REQUEST_FAILED: ${provider}${typeof status === "number" ? ` HTTP ${status}` : " network or SDK error"}. Check model, credentials, service URL and browser CORS support.`,
        );
      }
    };
  return describeTools(
    {
      "llm.openai": remote("openai"),
      "llm.anthropic": remote("anthropic"),
      "llm.local": (raw: Record<string, unknown>) =>
        options.local(parseInput(raw, true), options.signal),
    },
    AI_TOOL_DEFINITIONS,
  );
}
