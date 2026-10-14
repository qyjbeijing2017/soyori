# Model calls

These interfaces are shared between CLI and Editor; see [platform support](contract.md).

## Before you start

Start with llm.auto: supply input and map result to your reply field. See [connection settings](../editor/settings.md).

| Name | Meaning |
| --- | --- |
| input | Nonempty question text or complete message history |
| result | Reply text, or parsed JSON in remote JSON mode |
| message | Complete current model message for history/tool loops |
| toolCalls | Requested operations, not executed yet; empty if none |
| maxTokens | Generation limit in model tokens, not words |
| temperature | Variation from 0–1; omit if unsure |

Keep the complete message when continuing; result text alone may lose tool requests. Remote maxTokens defaults to 4096, range 1–32768. Local defaults to and caps at 512, with input plus maximum output sharing 2048 tokens.

Remote outputFormat json requires jsonSchema and cannot be combined with tool requests. Local rejects both format parameters. Connection fallback: step > effective environment > host settings > built-in defaults (official Base URL only). Missing configuration causes AI_CONFIG. Request failures do not automatically retry or switch providers.

Examples are step fragments with an answer field. All tools return result, toolCalls, message, finishReason, and usage. Use outputs to select properties or output for the full object.

## llm.local

Run fixed Qwen3-1.7B-ONNX on this device. First use prepares files and an inference session.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| input | string or messages[] | Required | Text or complete system/user/assistant/tool history |
| tools | string[] | Optional | Allowed names such as [time.now]; requests still require tools.execute |
| maxTokens | integer | Optional, 512 | 1–512; input + maximum output ≤ 2048 tokens |
| temperature | number | Optional, 0 | 0–1 |

Returns {result, toolCalls, message, finishReason: null, usage: null}.

```yaml
- type: call
  target: llm.local
  inputs:
    input: Hello
    maxTokens: 128
  output: $answer
```

## llm.openai

Call OpenAI or an OpenAI-compatible API, using environment/host fallback for connection settings.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| input | string or messages[] | Required | Text or complete system/user/assistant/tool history |
| model | string | Optional | OPENAI_MODEL, then host connection |
| apiKey | string | Optional | OPENAI_API_KEY, then host connection; supports field references |
| baseURL | string | Optional | Step > OPENAI_BASE_URL > host > official address |
| tools | string[] | Optional | Allowed names such as [time.now]; requests still require tools.execute |
| maxTokens | integer | Optional, 4096 | 1–32768 generated tokens |
| temperature | number | Optional | 0–1 |
| outputFormat | text or json | Optional | Remote defaults to text; local rejects this parameter |
| jsonSchema | object | Required for json | JSON Schema; leave absent in text mode; local does not support it |

Returns {result, toolCalls, message, finishReason, usage}.

```yaml
- type: call
  target: llm.openai
  inputs:
    input: Hello
  output: $answer
```

## llm.anthropic

Call the Anthropic API, using environment/host fallback for connection settings.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| input | string or messages[] | Required | Text or complete system/user/assistant/tool history |
| model | string | Optional | ANTHROPIC_MODEL, then host connection |
| apiKey | string | Optional | ANTHROPIC_API_KEY, then host connection; supports field references |
| baseURL | string | Optional | Step > ANTHROPIC_BASE_URL > host > official address |
| tools | string[] | Optional | Allowed names such as [time.now]; requests still require tools.execute |
| maxTokens | integer | Optional, 4096 | 1–32768 generated tokens |
| temperature | number | Optional | 0–1 |
| outputFormat | text or json | Optional | Remote defaults to text; local rejects this parameter |
| jsonSchema | object | Required for json | JSON Schema; leave absent in text mode; local does not support it |

Returns {result, toolCalls, message, finishReason, usage}.

```yaml
- type: call
  target: llm.anthropic
  inputs:
    input: Hello
  output: $answer
```

## llm.auto

Select using effective LLM_PROVIDER and host settings. Auto prefers complete OpenAI configuration, then Anthropic, then local. Explicit choices do not fail over.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| input | string or messages[] | Required | Text or complete system/user/assistant/tool history |
| model | string | Optional | OPENAI_MODEL / ANTHROPIC_MODEL, then host connection |
| apiKey | string | Optional | OPENAI_API_KEY / ANTHROPIC_API_KEY, then host connection; supports field references |
| baseURL | string | Optional | Step > provider BASE_URL environment > host > official address |
| tools | string[] | Optional | Allowed names such as [time.now]; requests still require tools.execute |
| maxTokens | integer | Depends on selected provider | Remote 1–32768, default 4096; local 1–512, default 512 |
| temperature | number | Optional | 0–1 |
| outputFormat | text or json | Optional | Remote defaults to text; local rejects this parameter |
| jsonSchema | object | Required for json | JSON Schema; leave absent in text mode; local does not support it |

Returns {result, toolCalls, message, finishReason, usage}.

```yaml
- type: call
  target: llm.auto
  inputs:
    input: Hello
  output: $answer
```
