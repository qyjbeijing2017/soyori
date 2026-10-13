# Inline groups and tool interfaces

`schemaVersion: 1` supports inline field groups and step groups. A group carries a nonempty `name`, optional Markdown `description`, and optional boolean `collapsed` (default `false`). This information belongs to the distributed JSON/YAML definition. Expanding a group in an editor is temporary view state; changing its default is a document edit.

## Fields

Use an ordered array to organize fields directly where they are declared:

```yaml
fields:
  - name: chatIn
    input: true
  - type: group
    name: Model settings
    description: Shared configuration
    collapsed: true
    fields:
      - name: model
        initial: example-model
      - name: apiKey
        input: true
  - name: chatOut
    output: true
```

Groups can nest. Field names must be globally unique, including across groups. Group names are presentation labels, not variable identifiers; `$model` still accesses the flat field. Flags and defaults retain their existing meanings. References to undeclared fields add declarations at the root of the array. Ungrouped object notation (`fields: { chatIn: { input: true } }`) is still accepted as a shorthand; there is no separate layout table.

`parseFlow` and `inspectFlow` preserve inline groups. `fieldEntries` returns the ordered tree, `fieldDefinitions` returns the flat interface/execution view, and `withFieldDefinitions` applies flat definition updates while preserving groups. Helpers expect already validated declarations; `parseFlow` remains the validator.

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

Inputs and outputs are ordered `ParameterEntry[]` trees with the same inline group shape. Parameters expose `name`, `description`, `valueType`, `required`, `defaultValue`, `initial` and `placeholder`. `defaultValue` documents the handler's runtime fallback and is only displayed as a placeholder. `initial` is a raw operand prefilled by an editor when selecting the tool. Neither property injects values in Core. The handler remains responsible for validation and defaults. `valueType` documents accepted values; it does not restrict `$` references or duplicate the handler's validation.

`outputs` describes named return properties. Tools with a dynamic whole return may instead provide `returns: { valueType, description }` and an empty `outputs` list; call `output` captures that result unchanged. `toolParameters` flattens interface groups. Normal functions without metadata remain executable, but cannot supply a generated editor form.

AI and storage packages export their definitions and attach them to registered functions; CLI's `script.run` also attaches its input and dynamic return description. Core never imports these packages. Metadata inspection itself does not load models or call a provider.
