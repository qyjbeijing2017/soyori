# Agent Plan AI 工具

Editor 与 CLI 共用的单次文本模型调用：`openai.generate`、`anthropic.generate`、`local.generate`。Core 没有引入模型依赖。

远程接入使用 LangChain 的 OpenAI/Anthropic 集成（MIT），本地使用 Transformers.js（Apache-2.0）。不引入 LangGraph，不实现 Agent 工具循环、工具自动执行、多模态或 Jev。

## 输入与输出

每次填写 `prompt` 或 `messages` 之一。`messages` 为非空数组，每项是 `{ "role": "system|user|assistant", "content": "文字" }`。不支持 tool 消息或内容块，不自动保存对话。

| 参数 | 说明 |
| --- | --- |
| `prompt` / `messages` | 提示词或完整多轮文本消息 |
| `model` | 可覆盖远程默认模型；本地当前只支持 LFM2.5-350M-ONNX |
| `maxTokens` | 正整数；远程默认 512、最多 32768；本地默认 128、最多 512。供应商可能有更严格限制 |
| `temperature` | 可选 0–1；远程省略则不发送，本地省略使用确定性解码。部分远程模型不接受此参数 |

未知参数报错。密钥和服务地址不从流程 inputs 接收，避免凭据写入工程或流程改变密钥发送目的地。

返回 `{ text, model, content, finishReason, usage }` 普通对象。`content` 保留供应商内容块，`usage` 来自供应商；本地目前不计算用量或推断结束原因，两者为 `null`。`outputs: { "text": "$answer" }` 只保存文字；`output` 保存整个结果。达到输出上限可能截断回复。

## CLI

从总工作区运行 `pnpm install`、`pnpm build`，然后：

```powershell
# 无需 API Key；首次下载、CPU 推理也计入总超时
pnpm cli run examples/ai-local.json --json --timeout 10m

$env:OPENAI_API_KEY = '<你的密钥>'
$env:OPENAI_MODEL = '<服务提供的模型 ID>'
pnpm cli run examples/ai-openai.json --json --timeout 3m

$env:ANTHROPIC_API_KEY = '<你的密钥>'
$env:ANTHROPIC_MODEL = '<服务提供的模型 ID>'
pnpm cli run examples/ai-anthropic.json --json --timeout 3m
```

可选 `OPENAI_BASE_URL`（兼容服务的 `/v1` 地址）、`ANTHROPIC_BASE_URL`（服务根地址）。URL 只接受 HTTP(S)，不含用户信息、查询串或片段。默认使用官方地址。模型 ID 由用户指定，不自动替换。

本地缓存默认在用户主目录 `.cache/agent-plan/models`，可用 `AGENT_PLAN_MODEL_CACHE` 指定。每次 CLI 运行有独立进程，流程中的多次调用复用模型；进程退出后释放内存，下次从文件缓存加载。`validate` 不加载模型或发送请求。进度写 stderr，`--json` 的 stdout 保持机器协议。AI 工具名不允许被 `--functions` 覆盖。

Tokenizer（分词器）负责文字与 token 的转换，和模型权重一起缓存。进度中的“加载”包括缓存读取及缺失文件的下载，不表示每次都联网下载。交互终端原地刷新文件加载百分比；重定向到日志时只输出阶段信息。完成、失败或中断后结束进度行。

远程单次请求最多 120 秒且关闭自动重试；CLI 总执行超时仍默认 30 秒，优先受总超时限制。父进程超时/中断终止执行进程；无法撤销供应商已产生的费用或远端计算。

## Editor

运行 `pnpm editor`，点击“添加 AI 调用”，点击步骤可选择本地/OpenAI/Anthropic，编辑提示词和输出。复杂消息数组使用调用配置 JSON；已有复杂输入/输出映射保持高级编辑模式。

“AI 设置”只在当前页面保存密钥、服务地址和默认模型；不落本地存储、不写进流程，刷新后清除。远程请求由浏览器直连所选地址，跨域许可取决于服务；库不会绕过 CORS。取消通过 AbortSignal 停止请求，不保证远端已停止处理。

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
