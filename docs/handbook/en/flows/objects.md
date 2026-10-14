# Fields: Objects and lists

An **object** holds named details about one thing, such as a person’s name and age. A **list** holds several items in order, such as purchases. Each list position starts at 0: the first item is 0, the second is 1.

## In the Editor

Give user an object value and items an empty list. Add an Append step whose value is an object with name read from $user.name and price set to 2.

![Fields: Objects and lists in the Editor](../../images/en/flow-objects-editor.jpg)

Import the example below and open it in the Editor to try its fields and steps.

## YAML and basic example

![YAML for the same fields: objects and lists example](../../images/en/flow-objects-yaml.jpg)

```yaml
schemaVersion: 1
name: Objects and lists
fields:
  user:
    initial:
      name: Alex
  items:
    initial: []
    output: true
steps:
  - type: append
    field: $items
    value:
      name: $user.name
      price: 2
```

The output is `{items: [{name: Alex, price: 2}]}`: one object appended to the list. Alex is the sample name.

## Rules and common questions

- `$user.name` reads a property; `$items[0].name` reads the first item’s name. A dot inside an actual key needs bracket syntax, such as `$data["a.b"]`.
- Object and list literals inside step inputs resolve references recursively in values, not keys. Field defaults remain raw data.
- Writing `$user.name` preserves other compatible properties; writing `$user` replaces the whole value. Missing or incompatible intermediate containers are created or replaced automatically.
- A [field group](groups.md#field-groups) only organizes the Editor. An object actually stores nested data.

See [path boundaries](operands.md) and [debugging](../debugging/guide.md).
