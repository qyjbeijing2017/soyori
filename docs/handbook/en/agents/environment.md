# Environment variables and sensitive values

Environment variables hold configuration, such as service addresses and API keys, outside the flow you share. A shared translation flow describes how to translate; each person supplies their own key in their environment settings.

Fields hold data for this run, such as source text and results. Environment variables hold runtime configuration. Model tools and web.search automatically read their documented settings; use env.get for other values. See [search configuration](../tools/web.md#configure-a-search-service).

## Configuration sources and scope

The root flow, subflows, and tools share the run's effective environment. Entering another file does not select another configuration.

| Entry point | Priority at startup, highest first |
| --- | --- |
| Web Chat, including its flow.run tests | Current conversation > global |
| Editor run or stepping | Current file test environment > global |
| CLI run/validate | --env > operating system > persistent global configuration |

Conversation and file-test settings are separate overrides, not three stacked layers. For example, global OPENAI_MODEL A and file override B mean Editor tests use B, while conversations without an override use A. Children inherit the environment of the initiating run.

env.override/load can change subsequent calls in this run without saving configuration. UI changes during a run apply to its next run.

Names are case-sensitive, use letters, digits, and underscores, and cannot start with a digit. Values are strings. Limits: 200 entries per scope and 65536 UTF-16 units per value. __proto__, constructor, and prototype are forbidden. An empty string still overrides a lower-priority value; delete the override to restore it.

See [Editor](../environment/editor.md) and [CLI](../environment/cli.md) instructions.

## Read values in a flow

env.get returns found and value. Missing means found false and value null; a configured empty string means found true. It reads startup settings plus current run overrides.

```yaml
schemaVersion: 1
name: Environment example
fields:
  apiKey:
    sensitive: true
steps:
  - type: call
    target: env.get
    inputs:
      name: SEARCH_API_KEY
    outputs:
      value: $apiKey
```

Subsequent calls can use $apiKey. They receive its actual value, not the obscured display. Children inherit the environment; CLI does not use threadId to choose it. SEARCH_API_KEY above is an arbitrary example name, not the provider-specific configuration used by web.search.

## Mark sensitive values

Select **Sensitive value** in environment settings to obscure its display. Field settings separately support sensitive true.

- Fields, defaults, keys, and sensitive environment values use an eye control. Reveal lasts 30 seconds with a countdown; click again to hide immediately.
- Editor/Chat field snapshots and CLI trace-values hide explicitly sensitive fields. CLI sensitive output and sensitive chatOut display [sensitive]. Core still returns original values.
- Chat records hide env.get returns. If a run stack has sensitive fields, tool input/output detail is hidden as a whole. Sensitive error details may be hidden while code and location remain.
- Downloading valid flows or projects removes sensitive fields' initial values, retaining declarations and flags. Original files are unchanged. Environments are not exported with Library.

**Sensitivity does not propagate automatically.** Reading, assignment, templates, scripts, and child returns do not mark destinations. Mark fields that must be hidden yourself. Unmarked derived values, replies, tool-written logs, and raw source may still expose data.

Marking does not encrypt values, prevent model/code access, or provide permission isolation. Keep credentials out of model input. Browser environments are local plaintext in the separate agent-plan-environment IndexedDB; CLI uses .environment under its storage directory. They do not synchronize.

## LLM connection fallback

llm.openai and llm.anthropic resolve each of model, apiKey, and baseURL using **step input > effective environment > host connection defaults > built-in defaults**. A resolved field reference is a step input. Omitted, null, empty, and whitespace-only values count as absent; other wrong types still fail.

| Parameter | OpenAI-compatible | Anthropic |
| --- | --- | --- |
| model | OPENAI_MODEL | ANTHROPIC_MODEL |
| apiKey | OPENAI_API_KEY | ANTHROPIC_API_KEY |
| baseURL | OPENAI_BASE_URL | ANTHROPIC_BASE_URL |

Web host defaults come from connection Settings. CLI has no browser connection settings. Built-in defaults provide official Base URLs only; missing model/key causes an error rather than guessing. An empty environment override masks the global entry, then connection fallback still applies.

With these environment values configured, a step only needs target llm.openai and its input. The key is used directly for the request; it need not enter a flow field and is not automatically placed in the prompt, tool schema, or result.

## Automatic model selection

llm.auto uses the same inputs and outputs as other model tools. Effective LLM_PROVIDER takes priority over the web provider setting. Values: auto, openai, anthropic, local. Blank uses the setting; CLI defaults to auto.

Auto selects a fully configured OpenAI connection first, then Anthropic, then local. Remote connections need both a nonempty model and key after fallback. OpenAI-compatible services such as DeepSeek use the OpenAI tool. Explicit remote selection with missing configuration fails; request failures do not trigger provider failover. Local still requires device support, download permission, and loading.

Default maxTokens is 4096 remotely and 512 locally. Local does not accept outputFormat/jsonSchema. The built-in assistant also uses llm.auto when set to auto. Model tools do not save history or run tool loops themselves.

## Assistant environment tools

- env.list lists effective names, sources, and states.
- env.inspect reads the state of one name.
- env.set takes name, string value, and optional sensitive. It saves only to the current conversation. New entries default to sensitive; the assistant cannot downgrade an already sensitive entry.

States are missing, empty, and set. Sensitive entries omit value; ordinary entries include it. The assistant cannot target other conversations or write global/file environments. Sensitive set parameters are hidden in execution records. Credentials typed directly in Chat still enter its history; use the environment form instead.

Assistant flow.run uses the initiating conversation's latest environment, so a setting can be tested in the same turn. Editor tests use the file environment. Sensitive outputs/errors are obscured on return to the assistant; model-visible subflows also hide marked outputs and sensitive defaults. These controls prevent common accidental disclosure, not arbitrary code access.

## Set CLI environments

See [CLI environments](../environment/cli.md). There is no --thread-id environment selection or automatic configuration-file discovery.

## Temporary overrides and file loading

env.override takes name, string value, and optional sensitive. New entries default to sensitive and existing sensitive values cannot be downgraded. It changes this run only. env.load reads a JSON file and applies all entries atomically; missing, invalid, or oversized files fail without partial updates. It returns success and names, not values.

```json
{
  "OPENAI_API_KEY": "demo-key",
  "OPENAI_MODEL": { "value": "deepseek-chat", "sensitive": false }
}
```

String shorthand defaults to sensitive. Metadata form requires string value and boolean sensitive. Maximum file size is 2 MiB, with normal name/count limits. For other formats, parse with script.run and call env.override.

CLI paths resolve relative to the calling flow, including a child's own directory; remote flows cannot read local configuration. Web loads only Library paths relative to the calling flow, not remote protocols. Overrides affect later requests and are not persisted. Raw-value env.get/override/load are execution tools, not directly exposed to the assistant model; its persistent conversation configuration uses env.set.
