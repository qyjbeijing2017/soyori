# Inline groups and tool interfaces

`schemaVersion: 1` supports inline field groups and step groups. A group carries optional Markdown `description` and optional boolean `collapsed` (default `false`). Step groups require a nonempty `name`; keyed field groups may omit `name` to display their mapping key. This information belongs to the distributed JSON/YAML definition. Expanding a group in an editor is temporary view state; changing its default is a document edit.

## Fields

Use a name-to-configuration mapping. Only entries with `type: group` are groups; other entries are ordinary field declarations:

```yaml
fields:
  chatIn:
    input: true
  Model settings:
    type: group
    name: Model settings
    description: Shared configuration
    collapsed: true
    fields:
      model:
        initial: example-model
      apiKey:
        input: true
  chatOut:
    output: true
```

Groups can nest using the same mapping syntax. Field names must be globally unique, including across groups. The group's mapping key is its stable presentation identifier; `name` is its optional label. Renaming the label does not change the key. Groups do not introduce a field scope: `$model` still accesses the flat field. Flags and defaults retain their existing meanings. Undeclared references add ordinary declarations at the root; a root group key cannot be overwritten by an implicit declaration. Sibling keys must be unique.

Legacy field arrays remain readable, including nested groups. Editor creates and saves mappings, converting old arrays without changing values, flags or grouping. New group keys are derived from their labels, with numeric suffixes on collisions; existing keys are retained. Ordinary-key insertion order is retained for display. Canonical unsigned integer keys follow JavaScript object enumeration order; field order does not affect execution. Step arrays and tool-parameter arrays are unchanged.

`parseFlow` and `inspectFlow` preserve validated declarations in their incoming representation. `fieldEntries` returns a presentation tree; mapped groups carry an internal `key` separate from their display `name`. `keyedFields` converts that tree or a legacy collection to mappings, stripping internal keys. `fieldDefinitions` returns only the flat ordinary-field interface/execution view. `withFieldDefinitions` applies flat updates while preserving group keys, labels, metadata and layout, retaining the incoming map/list representation. Helpers expect validated declarations; `parseFlow` remains the validator. Group `key` is not a property accepted in a serialized group configuration.

## Steps

```yaml
steps:
  - type: group
    name: Prepare reply
    description: These operations share the flow variables.
    collapsed: true
    steps:
      - type: set
        field: $chatOut
        value: $chatIn
```

Groups execute their children in order in the same invocation and scope. They do not emit a separate step event or consume a single-step action. Empty groups are skipped. Groups may contain or appear inside other groups, conditions and loops. Validation traverses even collapsed groups. Execution and error paths retain the document location, e.g. `steps[0].steps[0]`; inspect lists group metadata and all nested calls. Runtime limits and busy/reset semantics still apply to real operations.

## Tool descriptions

`ToolDefinition` describes a host function without introducing execution behavior:

```ts
const definitions = {
  "example.tool": {
    name: "example.tool",
    inputs: [
      { name: "input", valueType: "string", required: true, initial: "$chatIn" },
      { type: "group", name: "Options", collapsed: true, fields: [
        { name: "limit", valueType: "integer", defaultValue: 10 }
      ] }
    ],
    outputs: [{ name: "result", valueType: "string" }]
  }
};
const functions = describeTools({ "example.tool": handler }, definitions);
// functions["example.tool"].definition exposes the same description.
```

Tool inputs and outputs remain ordered `ParameterEntry[]` trees. Their interface groups are independent of flow-field mappings. Parameters expose `name`, `description`, `valueType`, `required`, `defaultValue`, `initial` and `placeholder`. `defaultValue` documents the handler's runtime fallback and is only displayed as a placeholder. `initial` is a raw operand prefilled by an editor when selecting the tool. Neither property injects values in Core. The handler remains responsible for validation and defaults. `valueType` documents accepted values; it does not restrict `$` references or duplicate the handler's validation.

`outputs` describes named return properties. Tools with a dynamic whole return may instead provide `returns: { valueType, description }` and an empty `outputs` list; call `output` captures that result unchanged. `toolParameters` flattens interface groups. Normal functions without metadata remain executable, but cannot supply a generated editor form.

AI and storage packages export their definitions and attach them to registered functions; CLI's `script.run` also attaches its input and dynamic return description. Core never imports these packages. Metadata inspection itself does not load models or call a provider.
