# 模型调用

本章逐个说明当前工具。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

## 使用前先了解

首次使用，通常选择 `llm.auto`，只填写 input，并将 result 保存到自己的回复字段。模型连接的图文设置见[设置](../editor/settings.md)。

| 名称 | 含义 |
| --- | --- |
| input | 交给 AI 的问题或消息历史，不能是空文字 |
| result | 模型给出的回答；普通模式是文字，远程 JSON 模式是解析后的数据 |
| message | 本轮完整模型消息，用于继续对话或工具循环 |
| toolCalls | 模型希望执行的工具请求；还没有执行，没有请求时是空列表 |
| maxTokens | 最多生成多少个 token；token 是模型处理文字的单位，不等于字数 |
| temperature | 生成变化程度，范围 0–1；不确定时可以省略 |

继续对话时，将完整 message 加入消息历史；只把 result 里的文字交回模型，可能丢掉工具请求。组合方式见[工具循环](../agents/models.md)。

使用限制与失败处理：

- 远程 maxTokens 默认 4096，范围 1–32768；本地默认和最多 512，输入与最大输出共用 2048 token 上下文。
- 远程 outputFormat 为 json 时，必须同时提供 jsonSchema，说明结果需要有哪些内容；不能同时启用工具请求。本地不支持这两个参数。
- 连接参数按“步骤填写值 > 有效环境 > 设置中的连接 > 内置默认值”读取；仅官方 Base URL 有内置默认。缺配置报 AI_CONFIG，请求失败不会自动重试或换供应商。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## llm.local

在当前设备运行固定 Qwen3-1.7B-ONNX 模型，首次需要准备模型文件和推理会话。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| input | string \| messages[] | 必填 | 文本或 system / user / assistant 消息列表。 |
| tools | string[] | 可选 | 允许模型请求的工具名称列表，例如 [time.now]；请求仍需 tools.execute 执行 |
| maxTokens | integer | 可选；默认 512 | 最多生成 512 token，输入与输出共用 2048 token 上下文。 |
| temperature | number | 可选；默认 0 | 范围 0–1。 |

返回：{result, toolCalls, message, finishReason: null, usage: null}。

命名输出属性：`result`、`toolCalls`、`message`、`finishReason`、`usage`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: llm.local
  inputs:
    input: 你好
    maxTokens: 128
  output: $answer
```

## llm.openai

调用 OpenAI 或兼容接口服务；连接参数可从有效环境和宿主配置读取。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| input | string \| messages[] | 必填 | 文本或 system / user / assistant 消息列表。 |
| model | string | 可选 | 省略时读取 OPENAI_MODEL，再使用宿主连接默认值。 |
| apiKey | string | 可选 | 省略时读取 OPENAI_API_KEY，再使用宿主连接默认值；支持 $字段引用。 |
| tools | string[] | 可选 | 允许模型请求的工具名称列表，例如 [time.now]；请求仍需 tools.execute 执行 |
| baseURL | string | 可选 | 步骤参数 > OPENAI_BASE_URL > 宿主连接默认值 > 官方地址。 |
| maxTokens | integer | 可选；默认 4096 | 输出 token 上限，范围 1–32768。 |
| temperature | number | 可选 | 范围 0–1。 |
| outputFormat | text \| json | 可选；默认 "text" | text 返回文字；json 按 jsonSchema 返回结构化数据 |
| jsonSchema | object | 可选 | 选择 json 时必填 JSON Schema 对象；text 模式留空。 |

返回：{result, toolCalls, message, finishReason, usage}。

命名输出属性：`result`、`toolCalls`、`message`、`finishReason`、`usage`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: llm.openai
  inputs:
    input: 你好
  output: $answer
```

## llm.anthropic

调用 Anthropic 接口；连接参数可从有效环境和宿主配置读取。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| input | string \| messages[] | 必填 | 文本或 system / user / assistant 消息列表。 |
| model | string | 可选 | 省略时读取 ANTHROPIC_MODEL，再使用宿主连接默认值。 |
| apiKey | string | 可选 | 省略时读取 ANTHROPIC_API_KEY，再使用宿主连接默认值；支持 $字段引用。 |
| tools | string[] | 可选 | 允许模型请求的工具名称列表，例如 [time.now]；请求仍需 tools.execute 执行 |
| baseURL | string | 可选 | 步骤参数 > ANTHROPIC_BASE_URL > 宿主连接默认值 > 官方地址。 |
| maxTokens | integer | 可选；默认 4096 | 输出 token 上限，范围 1–32768。 |
| temperature | number | 可选 | 范围 0–1。 |
| outputFormat | text \| json | 可选；默认 "text" | text 返回文字；json 按 jsonSchema 返回结构化数据 |
| jsonSchema | object | 可选 | 选择 json 时必填 JSON Schema 对象；text 模式留空。 |

返回：{result, toolCalls, message, finishReason, usage}。

命名输出属性：`result`、`toolCalls`、`message`、`finishReason`、`usage`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: llm.anthropic
  inputs:
    input: 你好
  output: $answer
```

## llm.auto

按有效环境 LLM_PROVIDER 和宿主设置选择模型。auto 优先配置完整的 OpenAI，再 Anthropic，否则本地。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| input | string \| messages[] | 必填 | 文本或 system / user / assistant 消息列表。 |
| model | string | 可选 | 省略时读取 OPENAI_MODEL / ANTHROPIC_MODEL，再使用宿主连接默认值。 |
| apiKey | string | 可选 | 省略时读取 OPENAI_API_KEY / ANTHROPIC_API_KEY，再使用宿主连接默认值；支持 $字段引用。 |
| tools | string[] | 可选 | 允许模型请求的工具名称列表，例如 [time.now]；请求仍需 tools.execute 执行 |
| baseURL | string | 可选 | 步骤参数 > OPENAI_BASE_URL / ANTHROPIC_BASE_URL > 宿主连接默认值 > 官方地址。 |
| maxTokens | integer | 可选 | 远程默认 4096、范围 1–32768；本地默认和最多 512 |
| temperature | number | 可选 | 范围 0–1。 |
| outputFormat | text \| json | 可选 | 远程默认 text；json 需配合 jsonSchema，本地不支持此参数 |
| jsonSchema | object | 可选 | 选择 json 时必填 JSON Schema 对象；text 模式留空。 |

返回：{result, toolCalls, message, finishReason, usage}。

命名输出属性：`result`、`toolCalls`、`message`、`finishReason`、`usage`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: llm.auto
  inputs:
    input: 你好
  output: $answer
```
