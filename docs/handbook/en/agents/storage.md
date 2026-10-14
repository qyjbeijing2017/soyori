# Storage and conversation memory

Fields are prepared again on each run. To keep data for later, save it and read it back. storage holds general data; memory helps assemble and persist model message history.

| Content | Purpose | Persistence |
| --- | --- | --- |
| Current fields | This run's input and results | Not automatically retained for later runs |
| Chat transcript | Review messages in Chat | Host-saved, but not automatically sent to the model |
| Flow memory | Supply needed history next turn | Explicit memory.init / memory.save |

Saving data does not save execution progress or resume an interrupted step.

## Storage keys and data

A key names a record, such as demo/settings. Slashes group names; there is no separate namespace parameter. Segments use lowercase letters, digits, hyphens, underscores, and dots; start with a letter, digit, hyphen, or underscore, and do not end with a dot. Absolute paths, empty segments, backslashes, and Windows reserved names are forbidden. Limits: 80 characters per segment, 240 total.

Prefixes match literally: use demo/ for a group, since demo also matches demo-other. Storage only accepts JSON, rejecting undefined, nonfinite numbers, cycles, functions, getters, special objects, and sparse arrays. Corruption/permission errors are not hidden as found false.

```yaml
- type: call
  target: storage.write
  inputs:
    key: demo/settings
    value:
      language: zh
- type: call
  target: storage.read
  inputs:
    key: demo/settings
  outputs:
    found: $found
    value: $settings
```

Expected: found true and settings `{language: "zh"}`. Writes replace the record; concurrent same-key writes use the last successful value without merging.

## Platform locations

Web uses same-origin IndexedDB; CLI uses JSON in its configured directory. They do not share data or automatically isolate by project. Clearing site data can delete browser storage; Library archives do not contain general storage or live state.

CLI priority: --storage-dir → SOYORI_STORAGE_DIR → configured storageDir → OS default. Windows defaults: %LOCALAPPDATA%/agent-plan/storage for data, %APPDATA%/agent-plan/config.json for config. macOS uses Application Support/agent-plan. Linux uses XDG_CONFIG_HOME/XDG_DATA_HOME, falling back to ~/.config and ~/.local/share.

Changing directories does not migrate data; config set stores an absolute path. CLI rejects symlinks inside storage, but this is not a sandbox against local processes. See [CLI](../cli/guide.md).

## Raw conversations and flow memory

Chat stores threads/<threadId> records with id, flowId, title, and messages. Content is text; structured replies use YAML display text with format yaml. Each turn saves the user message, passes chatIn/threadId, and appends a successful assistant reply. It does not supply memoryKey or automatically add history to a model. The UI index lives separately in agent-plan-conversations. Old transcripts are not migrated.

memory.init/save default to memory/<threadId>, separate from transcripts. prefix is customizable and threadId is one valid key segment. init reads, optionally replaces system and adds prompt, without saving. save validates completeness and persists.

setSystem replaces system messages with one at the front. addUser/addAssistant/addTools return new arrays. addTools requires exactly one matching ID/target result for each pending request; missing, duplicate, or orphan results fail. New user/model messages cannot interrupt unresolved requests.

A flow can read thread records, but writing them is not a memory merge API and may be overwritten by the UI. Deleting a conversation does not delete its memory key. Model failure does not automatically persist failed context as normal memory.

## Token counting

tokens.count accepts text or messages. Default local mode uses the current tokenizer and returns method tokenizer and model ID, without loading weights. Messages include chat-template/generation-prefix overhead; plain text does not add special tokens.

Estimate is offline, based on UTF-8 bytes and message overhead, returning method estimate and model null. It is not an actual remote-model count. Browser local mode needs tokenizer download permission.

For rename compatibility, SOYORI_STORAGE_DIR takes priority over AGENT_PLAN_STORAGE_DIR. Existing CLI default directories and browser database names retain agent-plan identifiers without migrating or clearing data.
