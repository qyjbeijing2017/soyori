# Built-in tool reference

A tool performs a specific job: trimming text, checking time, reading data, or calling a model. Use it through a Call step with its exact name, such as text.trim. [Assistant-only tools](assistant.md) are documented separately.

## How to read tool documentation

Each entry describes its purpose, input parameters, returned data, and an example. Required inputs must be supplied; optional inputs may be omitted, using defaults where specified. A **step fragment** belongs under steps in a complete flow and cannot run as a standalone file.

This complete flow turns -3 into 3:

```yaml
schemaVersion: 1
name: Try absolute value
fields:
  answer:
    output: true
steps:
  - type: call
    target: math.abs
    inputs:
      value: -3
    outputs:
      result: $answer
```

In Editor, create answer as Output, add Call → math.abs, set value to -3, and map result to answer. The output is `{answer: 3}`.

**Saving matters:** math.abs returns `{result: 3}`. outputs selects result, making answer the number 3. Most individual examples use output to save the entire object, making answer `{result: 3}`. See [Call outputs](../flows/calling.md#save-one-result-or-the-complete-return-object).

Types: string means text; number means numeric value; integer means whole number; boolean is true/false; object holds named values; [] means a list. JSON includes text, numbers, booleans, null, objects, and lists. You can consult [field types](../flows/types.md) as needed. A question mark marks an optional parameter. Model-requested tools are also limited by allowed tools and run budgets.

## Full guides by capability

| Guide | Contents |
| --- | --- |
| [Math, text, and lists](basic.md) | Basic tools, parameters, examples, errors |
| [Time and web](web.md) | Timezones, HTTP, search |
| [Storage and tokens](storage.md) | JSON records, tokenizer counts, estimates |
| [Memory](memory.md) | Initialize, append messages/results, save |
| [Models](models.md) | Auto, OpenAI-compatible, Anthropic, local |
| [Environment](environment.md) | Read, override, load, assistant queries |
| [Execution and scripts](execution.md) | Execute requests and return JavaScript results |
| [Assistant tools](assistant.md) | Docs, discovery, files, saved flow tests |

## Math, text, and arrays

These return `{result}`. Numeric tools require finite numbers rather than applying arithmetic steps' loose conversion.

| Name | Inputs | Result |
| --- | --- | --- |
| math.abs/floor/ceil/round | value | Absolute value or rounding using JS Math rules |
| math.min/max | values | Minimum/maximum of a nonempty numeric list |
| math.clamp | value, min, max | Bound a number; min ≤ max |
| math.random | min?=0, max?=1 | Noncryptographic random decimal in [min,max) |
| text.trim | text | Remove outer whitespace |
| text.split | text, separator | Literal split; empty separator uses UTF-16 units |
| text.replace | text, search, replacement | Replace all literal matches; search must be nonempty |
| array.concat | arrays | Merge lists one level |
| array.slice | array, start?=0, end? | Slice excluding end; negative indices count from the end |
| array.length | array | Item count |

Text and lists are limited to 100000 UTF-16 units/items, including generated results. BASIC_INPUT means invalid input; BASIC_LIMIT means size limit.

## Date and time

time.now takes optional timeZone and returns timestamp (Unix milliseconds), iso (UTC), timeZone, date, time (24-hour), and weekday (Monday 1 to Sunday 7). date/time use the returned zone. Omitted zone uses the host's timezone; supply a valid IANA zone when needed.

## Web

web.fetch accepts HTTP(S) url, optional method (GET), string-valued headers, body, and timeoutMs. GET/HEAD cannot send body; CONNECT/TRACE/TRACK are unsupported. String bodies are sent as-is; JSON is serialized with application/json if not already set.

Returns url (after redirects), status, headers, and body. JSON parses to data; text/XML stays text; empty responses are null. HTTP 4xx/5xx returns normally for your flow to inspect; network failures throw. It does not execute HTML scripts or extract article text.

timeoutMs defaults to 10000, range 1–60000. Request body and decompressed response each cap at 2 MiB. Charset follows response headers, default UTF-8. Errors include WEB_NETWORK/TIMEOUT/CANCELLED/SIZE/TYPE/ENCODING/JSON. Browser CORS still applies.

web.search takes query (up to 500 characters), limit?=3 (1–5), provider? (mwmbl/tavily/bocha), and maxSnippetChars?=240. Provider falls back to SEARCH_PROVIDER, then key-free Mwmbl. Keys come from the environment; see [search](web.md#web-search). Returns results with title, url, and snippet, not full pages. Empty results are not failure, and freshness is not guaranteed.

## Storage and tokens

env.get reads the current run environment and returns found/value; missing means null. Sensitivity does not propagate to destinations. See [environment](../agents/environment.md).

| Tool | Inputs | Return |
| --- | --- | --- |
| storage.read | key | found, value (null if missing) |
| storage.write | key, value | key; replaces the record |
| storage.delete | key | deleted; false if absent |
| storage.list | prefix? | sorted literal-prefix keys |
| tokens.count | input, mode? | tokens, method, model |

Storage accepts JSON only. tokens.count defaults to local tokenizer counting; estimate needs no download and is an approximation. See [storage](../agents/storage.md).

## Memory

| Tool | Inputs | Return |
| --- | --- | --- |
| memory.init | threadId, prefix?=memory, system?, prompt? | memory |
| memory.save | threadId, memory, prefix?=memory | No named output |
| memory.setSystem | memory?, text | memory |
| memory.addUser | memory?, input | memory |
| memory.addAssistant | memory?, message | memory |
| memory.addTools | memory?, results | memory |

Assembly creates new arrays without mutating inputs. Save requires results for all tool requests; init reads without saving. Supplied system/text/prompt/user text must be nonempty. See [memory details](memory.md).

## Models

llm.openai/anthropic/local accept input (text or complete message history), model, apiKey, baseURL, maxTokens, temperature, and tools. Remote tools also support outputFormat/jsonSchema; local uses one fixed model and rejects remote format parameters.

Connection fallback is step > environment > host defaults > official Base URL, with no default model/key. llm.auto uses LLM_PROVIDER/settings: complete OpenAI first, then Anthropic, then local. See [environment](../agents/environment.md).

All return result, finishReason, usage, toolCalls, and message. result is text in text mode and JSON in remote JSON mode. Do not read old text/content return fields. See [Agent flows](../agents/models.md).

## Batch tool execution

tools.execute takes calls `[{id,target,inputs}]` and optional allowed tools. inputs are literal JSON and are not reinterpreted as dollar references. Omitted tools adds no extra allowlist; an empty list forbids every target. Targets must have definitions and be available in the current scope.

Returns results containing id/target and either result or error. Ordinary tool failures become individual results; cancellation/budget exhaustion also records remaining requests as errors. It does not return messages: memory.addTools performs that conversion.

Shared limits: 64 model calls and 64 tool calls per run, 32 requests per batch, 2000 steps per tool subflow, and 8 nested tool-execution levels.

## Scripts

script.run takes code and optional input. It returns the whole JSON value passed to result(value), without a result property wrapper. See [script development](../scripts/development.md).
