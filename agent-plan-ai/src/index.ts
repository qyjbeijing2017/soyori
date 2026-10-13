import { createPreview, type ModelEvent } from "./stream.js";

export type { ModelEvent } from "./stream.js";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { describeTools } from "agent-plan-core";
import { type AutoProvider, resolveConnection, selectProvider } from "./connection.js";
import { AI_TOOL_DEFINITIONS } from "./definitions.js";
import { remoteFailure } from "./remote-failure.js";

export { resolveConnection, selectProvider } from "./connection.js";

import {
  type ChatMessage,
  parseCalls,
  parseMessages,
  type ResolvedTool,
  resolveTools,
  type ToolCall,
  type ToolOptions,
  toolNames,
  wireName,
} from "./tool-calling.js";

export { AI_TOOL_DEFINITIONS, TOKEN_TOOL_DEFINITIONS } from "./definitions.js";
export { createToolRegistry } from "./flow-tools.js";
export { createMemoryTools, MEMORY_TOOL_DEFINITIONS } from "./memory.js";
export { createToolExecutionTools, EXECUTION_TOOL_DEFINITIONS } from "./tool-calling.js";

import { BASE_URLS, LOCAL_MAX_TOKENS, LOCAL_MODEL, REMOTE_MAX_TOKENS } from "./definitions.js";

export { LOCAL_MODEL, LOCAL_REVISION } from "./definitions.js";
export const AI_TOOLS = ["llm.openai", "llm.anthropic", "llm.local", "llm.auto"] as const;
export type Provider = "openai" | "anthropic";
export interface Connection {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  model?: string | undefined;
}
export type Message = ChatMessage;
export interface GenerateInput extends Connection {
  messages: Message[];
  model?: string;
  maxTokens: number;
  temperature?: number;
  outputFormat?: "text" | "json";
  jsonSchema?: Record<string, unknown>;
  tools?: string[];
  toolDefinitions?: Omit<ResolvedTool, "run">[];
}
export interface GenerateResult {
  result: unknown;
  finishReason: string | null;
  usage: unknown;
  toolCalls?: ToolCall[];
  message?: Message;
}
export type LocalGenerate = (input: GenerateInput, signal?: AbortSignal) => Promise<GenerateResult>;
export interface AiOptions extends ToolOptions {
  provider?: AutoProvider;
  environment?: Readonly<Record<string, string>>;
  connections?: Partial<Record<Provider, Connection>>;
  local: LocalGenerate;
  signal?: AbortSignal;
  timeoutMs?: number;
  browser?: boolean;
  stream?: (event: ModelEvent) => void;
}

export function parseInput(input: Record<string, unknown>, local = false): GenerateInput {
  const allowed = new Set(["input", "model", "maxTokens", "temperature", "tools"]);
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
    messages = parseMessages(input.input);
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
    ...(input.tools === undefined ? {} : { tools: toolNames(input.tools) }),
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
  let modelCalls = 0;
  function prepare(raw: Record<string, unknown>, local = false) {
    if (options.signal?.aborted) throw Error("AI_CANCELLED: Model request cancelled.");
    if (++modelCalls > 64) throw Error("AI_MODEL_BUDGET: At most 64 model calls per run.");
    const input = parseInput(raw, local);
    input.toolDefinitions = resolveTools(input.tools ?? [], options).map(
      ({ run: _run, ...definition }) => definition,
    );
    if (input.tools?.length && input.outputFormat === "json")
      throw Error("AI_TOOLS: JSON output and tool calling cannot be combined.");
    return input;
  }
  const remote =
    (provider: Provider) =>
    async (raw: Record<string, unknown>): Promise<GenerateResult> => {
      const input = prepare(
        resolveConnection(provider, raw, options.environment, options.connections?.[provider]),
      );
      const config = input;
      if (!config.apiKey?.trim())
        throw new Error(
          `AI_CONFIG: Configure ${provider} apiKey in inputs or ${provider === "openai" ? "OPENAI" : "ANTHROPIC"}_API_KEY.`,
        );
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
        const preview = createPreview(options.stream);
        const common = {
          streaming: Boolean(options.stream),
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
        const bound = input.toolDefinitions?.length
          ? llm.bindTools(
              input.toolDefinitions.map((t) => ({
                type: "function" as const,
                function: {
                  name: t.name,
                  ...(t.description ? { description: t.description } : {}),
                  parameters: t.parameters,
                },
              })),
            )
          : llm;
        const response = await bound.invoke(
          input.messages.map((m) => {
            if (m.role === "tool")
              return new ToolMessage({ content: m.content as string, tool_call_id: m.toolCallId! });
            if (m.role === "assistant")
              return new AIMessage({
                content: m.content as AIMessage["content"],
                tool_calls: (m.toolCalls ?? []).map((c) => ({
                  id: c.id,
                  name: wireName(c.target),
                  args: c.inputs,
                  type: "tool_call" as const,
                })),
              });
            return m.role === "system"
              ? new SystemMessage(m.content as string)
              : new HumanMessage(m.content as string);
          }),
          {
            signal,
            ...(options.stream
              ? {
                  callbacks: [
                    {
                      handleLLMNewToken: (token: string) => {
                        if (!signal.aborted) preview(token);
                      },
                    },
                  ],
                }
              : {}),
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
        if (response.invalid_tool_calls?.length)
          throw Error("AI_TOOL_CALLS: Model returned malformed arguments.");
        const toolCalls = parseCalls(
          (response.tool_calls ?? []).map((call) => {
            const tool = input.toolDefinitions?.find((t) => t.name === call.name);
            if (!tool || !call.id)
              throw Error("AI_TOOL_CALLS: Model returned an unknown tool or missing call ID.");
            return { id: call.id, target: tool.target, inputs: call.args };
          }),
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
          toolCalls,
          message: {
            role: "assistant",
            content: response.content as Message["content"],
            ...(toolCalls.length ? { toolCalls } : {}),
          },
        };
      } catch (error) {
        if (error instanceof Error && /^(AI_JSON_OUTPUT|AI_TOOL_CALLS):/.test(error.message))
          throw error;
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
        throw new Error(remoteFailure(provider, error));
      }
    };
  const handlers = {
    "llm.openai": remote("openai"),
    "llm.anthropic": remote("anthropic"),
    "llm.local": async (raw: Record<string, unknown>) => {
      const result = await options.local(prepare(raw, true), options.signal);
      return {
        ...result,
        toolCalls: result.toolCalls ?? [],
        message: result.message ?? {
          role: "assistant" as const,
          content: String(result.result ?? ""),
        },
      };
    },
  };
  return describeTools(
    {
      ...handlers,
      "llm.auto": (raw: Record<string, unknown>) => {
        const provider = selectProvider(
          raw,
          options.environment,
          options.connections,
          options.provider,
        );
        return handlers[`llm.${provider}`](raw);
      },
    },
    AI_TOOL_DEFINITIONS,
  );
}
