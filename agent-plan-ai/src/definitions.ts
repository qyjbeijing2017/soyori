import type { ParameterEntry, ToolDefinition } from "agent-plan-core";

export const LOCAL_MODEL = "LiquidAI/LFM2.5-350M-ONNX";
export const LOCAL_MAX_TOKENS = 512;
export const REMOTE_MAX_TOKENS = 4096;
export const BASE_URLS = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

function llm(name: string, local: boolean): ToolDefinition {
  const inputs: ParameterEntry[] = [
    {
      name: "input",
      valueType: "string | messages[]",
      required: true,
      initial: "$chatIn",
      description: "文本或 system / user / assistant 消息列表。",
    },
  ];
  if (!local)
    inputs.push(
      {
        name: "model",
        valueType: "string",
        required: true,
        placeholder: "填写该服务提供的模型 ID",
      },
      {
        name: "apiKey",
        valueType: "string",
        required: true,
        description: "服务令牌。可填写 $变量名，避免将令牌直接保存在流程中。",
      },
    );
  const advanced: ParameterEntry[] = [];
  if (!local)
    advanced.push({
      name: "baseURL",
      valueType: "string",
      defaultValue: name === "llm.openai" ? BASE_URLS.openai : BASE_URLS.anthropic,
      description: "每个调用步骤独立设置，也可以引用运行变量。",
    });
  advanced.push(
    {
      name: "maxTokens",
      valueType: "integer",
      defaultValue: local ? LOCAL_MAX_TOKENS : REMOTE_MAX_TOKENS,
      description: local
        ? "最多生成 512 token，输入与输出共用 2048 token 上下文。"
        : "输出 token 上限，范围 1–32768。",
    },
    {
      name: "temperature",
      valueType: "number",
      ...(local ? { defaultValue: 0 } : { placeholder: "服务端默认值" }),
      description: "范围 0–1。",
    },
  );
  if (!local)
    advanced.push(
      { name: "outputFormat", valueType: "text | json", defaultValue: "text" },
      {
        name: "jsonSchema",
        valueType: "object",
        description: "选择 json 时必填 JSON Schema 对象；text 模式留空。",
      },
    );
  inputs.push({
    type: "group",
    name: "高级设置",
    collapsed: true,
    fields: advanced,
  });
  return {
    name,
    description: "单次模型调用。",
    inputs,
    outputs: [
      { name: "result", valueType: "string | JSON", description: "文本或解析后的 JSON 结果。" },
      {
        type: "group",
        name: "运行信息",
        collapsed: true,
        fields: [
          {
            name: "finishReason",
            valueType: "string | null",
            description: "生成停止的原因。本地调用暂不提供。",
          },
          {
            name: "usage",
            valueType: "object | null",
            description: "服务返回的 token 用量。本地调用暂不提供。",
          },
        ],
      },
    ],
  };
}

export const AI_TOOL_DEFINITIONS: Record<string, ToolDefinition> = Object.fromEntries(
  ["llm.local", "llm.openai", "llm.anthropic"].map((name) => [
    name,
    llm(name, name === "llm.local"),
  ]),
);
export const TOKEN_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  "tokens.count": {
    name: "tokens.count",
    description: "本地 tokenizer 计数或显式估算。",
    inputs: [
      {
        name: "input",
        valueType: "string | messages[]",
        initial: "$messages",
        description: "文本或消息数组；文本直接计数，消息数组包含聊天模板开销。",
      },
      { name: "mode", valueType: "local | estimate", defaultValue: "local" },
    ],
    outputs: [
      { name: "tokens", valueType: "number" },
      { name: "method", valueType: "string" },
      { name: "model", valueType: "string | null" },
    ],
  },
};
