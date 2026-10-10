# Agent Plan AI 工具

Editor 与 CLI 共用的单次文本模型调用：`llm.openai`、`llm.anthropic`、`llm.local`。Core 没有引入模型依赖。

远程接入使用 LangChain 的 OpenAI/Anthropic 集成（MIT），本地使用 Transformers.js（Apache-2.0）。不引入 LangGraph，不实现 Agent 工具循环、工具自动执行、多模态或 Jev。

## 输入与输出

统一填写 `input`：非空字符串作为一条 user 消息，或传入非空消息数组，每项是 `{ "role": "system|user|assistant", "content": "文字" }`。不支持 tool 消息或内容块，不自动保存对话。

| 参数 | 说明 |
| --- | --- |
| `input` | 非空字符串，或完整多轮文本消息数组 |
| `model` | 远程必填；本地当前只支持 LFM2.5-350M-ONNX |
| `baseURL` / `apiKey` | 远程步骤连接参数，支持变量引用；baseURL 省略使用官方服务，apiKey 必填 |
| `outputFormat` / `jsonSchema` | 远程输出格式：默认 text；json 模式必须提供 JSON Schema 对象 |
| `maxTokens` | 正整数；远程默认 4096、最多 32768；本地默认 512、最多 512。供应商可能有更严格限制；本地输入加最大输出仍须不超过 2048 token |
| `temperature` | 可选 0–1；远程省略则不发送，本地省略使用确定性解码。部分远程模型不接受此参数 |

未知参数报错。每个远程调用独立读取 inputs 中的连接配置，不再读取设置页或 CLI 供应商环境变量。直接填写的密钥会随流程保存和导出；可以引用运行时输入变量，避免把密钥作为默认值保存。显式开启 trace 值采集时也应注意输入内容。

三种模型工具统一返回 `{ result, finishReason, usage }`。文本模式 result 是字符串，远程 JSON 模式是解析后的 JSON 值；不再返回 text、json、model、content。usage 来自供应商；本地 finishReason 和 usage 均为 null。`outputs: { "result": "$answer" }` 保存业务结果，`output` 保存整个返回对象。

## CLI

从总工作区运行 `pnpm install`、`pnpm build`，然后：

```powershell
# 无需 API Key；首次下载、CPU 推理也计入总超时
pnpm cli run examples/ai-local.json --json --timeout 10m

pnpm cli run examples/ai-openai.json --input connection.json --json --timeout 3m
pnpm cli run examples/ai-anthropic.json --input connection.json --json --timeout 3m
```

connection.json 通过 apiKey、model、baseURL 字段提供连接信息。OpenAI baseURL 为兼容服务的 /v1 地址；Anthropic 为服务根地址。URL 仅接受 HTTP(S)，不含用户名、密码、查询串或片段。

本地缓存默认在用户主目录 `.cache/agent-plan/models`，可用 `AGENT_PLAN_MODEL_CACHE` 指定。每次 CLI 运行有独立进程，流程中的多次调用复用模型；进程退出后释放内存，下次从文件缓存加载。`validate` 不加载模型或发送请求。进度写 stderr，`--json` 的 stdout 保持机器协议。AI 工具名不允许被 `--functions` 覆盖。

Tokenizer（分词器）负责文字与 token 的转换，和模型权重一起缓存。进度中的“加载”包括缓存读取及缺失文件的下载，不表示每次都联网下载。交互终端原地刷新文件加载百分比；重定向到日志时只输出阶段信息。完成、失败或中断后结束进度行。

远程单次请求最多 120 秒且关闭自动重试；CLI 总执行超时仍默认 30 秒，优先受总超时限制。父进程超时/中断终止执行进程；无法撤销供应商已产生的费用或远端计算。

## Editor

运行 `pnpm editor`，Agent 页面直接对话；在 Library 打开流程进入 Editor，添加调用步骤并选择本地/OpenAI/Anthropic 工具。提示词、消息数组、对象参数及输出映射均通过结构化表单编辑，不需要手写 JSON。

远程连接配置已移到调用步骤，设置页面仅保留本地模型选项。API 请求由浏览器直连指定服务，服务需支持 CORS。停止通过 AbortSignal 取消请求。

本地调用先勾选允许下载，模型运行在 Web Worker 中，进度展示在结果区。“取消 AI 调用”终止本地 Worker，之后可重新运行；“释放本地模型内存”保留下载缓存。普通“暂停”仍仅在步骤之间生效。本地单次加载加生成上限 10 分钟。

## 本地模型与兼容性

固定使用 [LiquidAI/LFM2.5-350M-ONNX](https://huggingface.co/LiquidAI/LFM2.5-350M-ONNX)，从上游默认 revision 下载：

- 浏览器：WebGPU + `shader-f16`，Q4F16 权重约 255 MB。
- CLI：Node CPU，Q4 权重约 294 MB。
- 两端还需分词器和运行库；文件大小不是运行内存。浏览器缓存可能因配额或清理丢失。
- 本地输入和输出合计限制 2048 tokens；不承诺所有手机可用，不支持时明确报错，不自动切到付费服务。
- 上游 revision 或网络变化会影响下载和结果；离线首次使用不支持。

权重适用 [LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM2.5-350M/blob/main/LICENSE)，不同于代码依赖许可证，包含商业使用条件。本仓库不捆绑或重新分发权重。

## 验证

另提供 `agent-plan-ai/tokens` 的 `createTokenTools`，向 CLI/Editor 注册 `tokens.count`。支持本地 tokenizer 精确计数及明确标注的无网络估算，不加载模型权重。契约和存储示例见 [存储与计数](../docs/storage-and-tokens.md)。

`pnpm --filter agent-plan-ai test` 使用本地 HTTP 模拟服务验证真实 LangChain 请求转换、输出、错误脱敏和取消，不消费付费 API。CLI 另有子进程集成测试。默认自动测试不下载模型，真实推理使用上面的示例。

2026-10-01 已在当前 Windows Node CPU 与桌面 Chromium 生产构建中验证本地中文生成。手机实机及真实付费供应商账号尚未验证；模拟协议测试不是线上模型质量或全设备兼容保证。

## JSON 输出

远程调用设置 outputFormat: json，并传入 jsonSchema（JSON Schema 对象）。OpenAI 发送 response_format.json_schema（strict: true），Anthropic 发送 output_config.format。选择支持结构化输出的模型和服务；Schema 采用服务支持的子集，接口拒绝时直接报错，不降级为提示词约束。成功后 result 保存 JSON.parse 的结果；拒绝、截断或非法 JSON 报错，不修复或自动重试。Schema 约束由供应商执行，宿主校验 JSON 语法及完成状态。

```yaml
type: call
target: llm.openai
inputs:
  baseURL: $baseURL
  apiKey: $apiKey
  model: $model
  input: 请返回包含 ok=true 的 JSON 对象
  outputFormat: json
  jsonSchema:
    type: object
    properties:
      ok: { type: boolean }
    required: [ok]
    additionalProperties: false
outputs:
  result: $answer
```

本地 LFM 当前适配未接入 JSON 约束。Transformers.js 4.3 已提供实验性的 @huggingface/transformers-structured-output 扩展，官方以 LFM2.5-350M 演示 logits_processor 约束解码；这证明存在接入路径，不代表当前项目已完成 Node/WebGPU 实测。见 [官方发布说明](https://github.com/huggingface/transformers.js/releases/tag/4.3.0)。

### 工具接口元数据

导出 `AI_TOOL_DEFINITIONS` 和 `TOKEN_TOOL_DEFINITIONS`；`createAiTools` / `createTokenTools` 的每个函数同时提供 `.definition`。接口包含 inputs、outputs、说明、值类型、必填提示、defaultValue（运行默认值）、initial（Editor 原始预填操作数）和内联 group。Editor 直接消费此接口。LLM 的生成选项、JSON 输出设置与运行信息默认折叠；调用 inputs 仍是平铺对象。

Editor 的 LLM 参数将必填项放在外层：本地仅 input；远程为 input、model、apiKey。其他参数统一收进默认折叠的“高级设置”，包含可选的服务地址、生成参数及远程 JSON 输出配置。本地模型固定为 LFM2.5-350M，不提供模型选择输入。

## 工具调用（2026-10-09）
三种模型均支持 tools 调用名数组，新增 toolCalls 和完整 message 输出。tools.execute 顺序执行请求，仅返回 results；tools 限制可选，默认留空不额外限制。消息与记忆编排交由独立工具。说明可选，函数接口自动生成参数结构，导入流程通过 Core 执行。详细约定与限制见 [工具调用](../docs/tool-calling.md)，可导入 [示例](../examples/tool-calling.yaml)。
