# Fields and data paths

Step inputs accept JSON constants, dollar-prefixed references, and double-dollar escapes. This reference explains the boundaries between data, paths, and templates. Start with [constants](constants.md), [variables](variables.md), and [objects and lists](objects.md).

## Paths in Editor and YAML

![An object value and an Append step referencing user.name](../../images/en/flow-objects-editor.jpg)

The Append step places `$user.name` inside a new object. Choose or enter a reference in the Editor; YAML writes the dollar-prefixed path. Object keys themselves are not references.

![Equivalent object and list YAML](../../images/en/flow-objects-yaml.jpg)

See the complete importable [object example](objects.md).

## Reads and constants

| Input | Meaning |
| --- | --- |
| `10`, `true`, `null`, `"hello"` | Constants |
| `"$count"` | Field count |
| `"$user.name"` | Object property |
| `"$items[0].name"` | Property of a list item |
| `'$data["a.b"]'` | A key containing a dot |
| `"$$name"` | Literal text $name |
| An object or list | Resolve references recursively in values, never keys |

Run inputs, defaults, host setFields(), and tool returns are raw data: dollar signs inside them are not interpreted. An object obtained through a reference is not recursively reinterpreted. Literal containers are newly created each execution; referenced objects preserve their identity.

`$count + 1`, `$items[$index]`, and method calls are not valid paths. Compute using steps or JavaScript in script.run.

## Writes

Destinations in field, output, and outputs require a leading dollar sign. Declaration names, input names, and returned property names do not.

Writing `$request.options.temperature` creates missing or replaces incompatible intermediate containers. Compatible objects retain other properties. Writing `$request` replaces the whole value. Reading a missing path returns undefined without modifying data.

Writing `$items[3]` fills skipped positions with null. Append adds one item. Numeric indices range from 0 to 9999; append can grow to at most 10000 items. One step can create at most 10000 array slots through path expansion. Do not resize through .length.

Paths forbid __proto__, constructor, and prototype, do not follow prototype chains, and do not execute getters. Frozen or read-only compatible objects may still reject writes. Automatic container creation does not disable validation or resource limits.

## Text templates

```yaml
- type: template
  template: |-
    User $user.name$
    First item $items[0]$
    Price $$99
  output: $message
```

Templates use paired `$path$`. The example inserts a user name and first list item, and writes the literal price `$99` using `$$99`. Unset becomes empty text; numbers, booleans, and null become text; plain objects and lists become YAML. Cycles, binary data, and special objects cause INVALID_TEXT.

Ordinary operand text containing `hello $name$` stays unchanged. Only a template body interpolates it. The old concat step was removed.

## Call outputs and errors

`outputs: {answer: "$result.answer"}` reads the return object's direct own property answer. Save the full object with output before reading a deeper path in later steps.

Mappings must not write to duplicate or overlapping destinations, such as $result and $result.answer. Failure while preparing ordinary container writes leaves no partial mappings. Tool side effects, network requests, and shared-object mutations are not rolled back.

Invalid static paths are reported during validation at the step. Runtime failures include INVALID_PATH, ARRAY_LIMIT, and INVALID_VALUE. See [debugging](../debugging/guide.md).
