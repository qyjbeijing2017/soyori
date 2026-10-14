# Runtime environment

These tools share interfaces between CLI and Editor; see [platform support](contract.md).

## Before you start

Environment values must be strings, such as model IDs or service addresses. There are at most 200 entries and 65536 UTF-16 units per value. See [environment scope](../agents/environment.md).

env.override and env.load affect later calls in this run only. New entries default to sensitive, and existing sensitive entries cannot be downgraded. env.load accepts the documented JSON format, at most 2 MiB, and fails atomically on invalid input. See [configuration files](../agents/environment.md#temporary-overrides-and-file-loading).

env.get/override/load are execution tools. The assistant uses the separate list/inspect/set interfaces below. YAML examples are [step fragments](reference.md#how-to-read-tool-documentation) with an answer field.

## env.get

Read an original value from the effective run environment. Required **name** is an exact string. Returns found and value. Missing gives value null; found distinguishes absence from an empty string. Map found/value separately or save the whole object.

```yaml
- type: call
  target: env.get
  inputs:
    name: OPENAI_MODEL
  output: $answer
```

## env.override

Override one value for this run; subsequent tools and children see it. No persistent configuration is changed.

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| name | string | Yes | Exact variable name |
| value | string | Yes | New text value |
| sensitive | boolean | No | Obscure display; new entries default to true |

Returns success true and names. Save the whole object with output; there is no additional result wrapper.

```yaml
- type: call
  target: env.override
  inputs:
    name: LLM_PROVIDER
    value: local
    sensitive: false
  output: $answer
```

## env.load

Load JSON and apply it as run overrides. Required **path** is a string relative to the calling flow; ./environment.json means a file beside it. Browser uses Library; CLI uses local files and rejects access from remote flows.

Returns success true and names, without original configuration values. Use output for the whole return value.

```yaml
- type: call
  target: env.load
  inputs:
    path: ./environment.json
  output: $answer
```

## Assistant only: env.list

No inputs. Lists the current conversation's effective names, sources, and missing/empty/set states. Returns variables, each with name, found, status, and source/sensitive when present. Sensitive entries omit value; ordinary entries can include it. Use it to check configuration completeness.

```json
{"target":"env.list","inputs":{}}
```

## Assistant only: env.inspect

Required string **name** selects one entry. Returns name, found, status, and optional source/sensitive/value. It reports sensitive state without revealing the key.

```json
{"target":"env.inspect","inputs":{"name":"OPENAI_MODEL"}}
```

## Assistant only: env.set

Required **name** and string **value**; optional boolean **sensitive**. Saves only to the current conversation, not global or file-test settings. Returns success and the updated name/source/state. New entries default to sensitive, and existing sensitivity cannot be removed through this tool. New ordinary settings can explicitly use false.

```json
{"target":"env.set","inputs":{"name":"OPENAI_MODEL","value":"your-model-id","sensitive":false}}
```

These three interfaces are for the web assistant, not CLI or ordinary runtime environment calls. Use forms rather than typing credentials in Chat. See [environment principles](../agents/environment.md).
