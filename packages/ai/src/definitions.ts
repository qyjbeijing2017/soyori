import { type ParameterEntry, type ToolDefinition, toolParameters } from "soyori-core";

export const LOCAL_MODEL = "onnx-community/Qwen3-1.7B-ONNX";
export const LOCAL_REVISION = "b85539623180ae64303f37373d942cb0595ca44d";
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
        placeholder: "填写该服务提供的模型 ID",
        description: "省略时读取 OPENAI_MODEL / ANTHROPIC_MODEL，再使用宿主连接默认值。",
      },
      {
        name: "apiKey",
        valueType: "string",
        description:
          "省略时读取 OPENAI_API_KEY / ANTHROPIC_API_KEY，再使用宿主连接默认值；支持 $字段引用。",
      },
    );
  const advanced: ParameterEntry[] = [];
  advanced.push({
    name: "tools",
    valueType: "string[]",
    description: "允许模型请求的调用名列表，说明可选。",
  });
  if (!local)
    advanced.push({
      name: "baseURL",
      valueType: "string",
      placeholder: name === "llm.openai" ? BASE_URLS.openai : BASE_URLS.anthropic,
      description: "步骤参数 > OPENAI_BASE_URL / ANTHROPIC_BASE_URL > 宿主连接默认值 > 官方地址。",
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
      { name: "toolCalls", valueType: "JSON", description: "工具请求列表；没有请求时为 []。" },
      {
        name: "message",
        valueType: "JSON",
        description: "本轮完整模型消息，继续调用前追加到上下文。",
      },
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
const auto = llm("llm.auto", false);
auto.description =
  "按 LLM_PROVIDER、宿主供应商设置选择；auto 时优先配置完整的 OpenAI，再 Anthropic，否则本地。失败不切换重试。连接参数沿用各供应商环境回退。";
for (const entry of toolParameters(auto.inputs)) {
  if (entry.name === "maxTokens" || entry.name === "outputFormat") delete entry.defaultValue;
  if (entry.name === "maxTokens") entry.placeholder = "远程默认 4096；本地默认 512";
}
AI_TOOL_DEFINITIONS["llm.auto"] = auto;
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
