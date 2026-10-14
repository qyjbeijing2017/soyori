# Quick start: YAML + CLI

Build a single-turn Chinese-to-English translation assistant in an empty YAML file. This is the same flow as the [desktop](quick-start.md) and [mobile](quick-start-mobile.md) lessons. Run these PowerShell commands in the folder where you want your files; no source checkout is required for this lesson.

## 1. Prepare the CLI

Install [Node.js 24 or newer](https://nodejs.org/en/download), including npm, then run:

```powershell
npm install -g soyori-cli
soyori --help
```

Skip installation if already installed. This installs the runner; model files download separately when needed. The following commands use `soyori` and do not need pnpm.

## 2. Prepare a model (optional)

With no API connection configured, `llm.auto` uses local Qwen3-1.7B-ONNX (`onnx-community/Qwen3-1.7B-ONNX`). The CLI prefers GPU with Q4F16 weights, about 1.44 GB. If GPU initialization fails, it falls back to CPU with Q4 weights, about 2.15 GB, potentially requiring another download.

**Download once, load for each process.** Files are reused while cached. Each new `soyori run` starts a process and loads the local model again; this may take several minutes. Model calls within one run reuse it.

To use a local model, skip to step 3. For OpenAI or a compatible service, set the following in the current PowerShell window. Replace the API key and model placeholders; compatible services also need their own Base URL:

```powershell
$env:LLM_PROVIDER = "auto"
$env:OPENAI_API_KEY = "YOUR_API_KEY"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"
$env:OPENAI_MODEL = "YOUR_MODEL_ID"
```

These settings affect processes launched from this window. Browser settings are separate. Existing connection settings can be reused.

## 3. Create the flow file

Create `translate.yaml` with:

```yaml
schemaVersion: 1
name: Single-turn translator
description: Translate Chinese text into English. Each run is independent, without saved conversation memory.
```

`schemaVersion` is the format version, `name` is the flow name, and `description` is optional. Append the following sections to the same file; wait until step 6 is complete before running it.

Use spaces for YAML indentation, never tabs. The snippets include the required indentation. `fields`, `steps`, and `schemaVersion` start at the left edge.

## 4. Create three fields

Append:

```yaml
fields:
  chatIn:
    input: true
    initial: 今天的天气很好。
  prompt: {}
  chatOut:
    output: true
```

- **chatIn:** the source text. `input: true` allows command input; `initial` supplies a default Chinese sentence.
- **prompt:** an internal value filled by the template, with no default needed.
- **chatOut:** the reply. `output: true` includes it in the CLI result.

## 5. Assemble the prompt

Append the first step:

```yaml
steps:
  - type: template
    template: |-
      Translate the following Chinese text into English. Return only the translation:
      $chatIn$
    output: $prompt
```

The template asks for an English translation. `|-` introduces multiline text; `$chatIn$` inserts the source. `output: $prompt` saves the complete prompt.

## 6. Call the model

Append the second step aligned with `- type: template`. **Do not add another steps key.**

```yaml
  - type: call
    target: llm.auto
    inputs:
      input: $prompt
    outputs:
      result: $chatOut
```

`$prompt` reads the template result; `result: $chatOut` saves the reply. Omitted connection parameters use existing configuration or the default local model.

Template insertion uses `$chatIn$` with two dollar signs. Reading a whole field uses `$prompt` with one leading dollar sign. Save the file; the complete YAML is at the end of this page.

## 7. Run and inspect the result

```powershell
soyori run ./translate.yaml --set-string "chatIn=今天的天气很好。" --timeout 10m --json
```

`--set-string` passes text, `--json` requests JSON, and `--timeout 10m` gives the whole run ten minutes, including downloading, loading, and generation. Wait for local model loading to finish.

A successful result looks like:

```json
{"version":1,"ok":true,"result":{"chatOut":"The weather is very nice today."}}
```

Wording varies. Download and device diagnostics are separate from result JSON. Only the declared output chatOut appears in the final result.

## 8. Edit and run again

In the template, change `English` to `Japanese`:

```yaml
    template: |-
      Translate the following Chinese text into Japanese. Return only the translation:
      $chatIn$
```

Save and repeat step 7. chatOut should be Japanese; the model step stays the same. To translate another sentence, change the command input:

```powershell
soyori run ./translate.yaml --set-string "chatIn=很高兴认识你。" --timeout 10m --json
```

## 9. Inspect intermediate values (optional)

Record field values after each step to check prompt:

```powershell
soyori run ./translate.yaml --set-string "chatIn=今天的天气很好。" --timeout 10m --trace translate-run-001.jsonl --trace-values --json
```

Open the trace and inspect the fields after `steps[0]`. A trace is a run record, not a resumable checkpoint. Use a **new filename** each time, such as `translate-run-002.jsonl`; existing trace files are not overwritten. `--trace-values` records runtime data, including inputs.

If a run fails, check its error, indentation, network, and model connection. See the [CLI reference](cli/guide.md). Continue with [memory](quick-start-memory.md), then [tools](quick-start-tools.md).

## Complete YAML

The English-translation flow from steps 3–6:

```yaml
schemaVersion: 1
name: Single-turn translator
description: Translate Chinese text into English. Each run is independent, without saved conversation memory.
fields:
  chatIn:
    input: true
    initial: 今天的天气很好。
  prompt: {}
  chatOut:
    output: true
steps:
  - type: template
    template: |-
      Translate the following Chinese text into English. Return only the translation:
      $chatIn$
    output: $prompt
  - type: call
    target: llm.auto
    inputs:
      input: $prompt
    outputs:
      result: $chatOut
```
