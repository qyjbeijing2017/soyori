# Storage and tokens

CLI and Editor share these interfaces, using separate storage. See [platform support](contract.md).

## Before you start

A key names one record, such as demo/settings. Writing the same key replaces it completely. Values must be JSON: no undefined, functions, cycles, or nonfinite numbers.

Keys use lowercase letters, digits, hyphens, underscores, and dots, with slash-separated groups. No empty segments, absolute paths, or Windows reserved names. Each segment caps at 80 characters; total length caps at 240. Prefix matching is literal: demo also matches demo-other; use demo/ for the group.

Local token counting downloads tokenizer files, not model weights. Estimate mode downloads nothing and approximates usage. Neither is a universal remote-model count. See [storage details](../agents/storage.md).

Examples are [step fragments](reference.md#how-to-read-tool-documentation), assuming an answer field. Use outputs for named properties or output for the whole return object.

## tokens.count

A token is a unit of model text processing, not the same as a word or character. Count text/history to check its size before sending it to a model.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| input | string or messages[] | Required | Text, or messages including chat-template overhead |
| mode | local or estimate | Optional, local | Actual current local tokenizer count, or download-free approximation |

Returns tokens, method, and model. Estimate reports method estimate and model null. This does not measure arbitrary remote model usage.

```yaml
- type: call
  target: tokens.count
  inputs:
    input: Hello
    mode: estimate
  output: $answer
```

## storage.read

Read JSON by key. **key** is a required string. Existing records return found true and value; missing records return found false and value null. A read failure is an error, distinct from absence.

```yaml
- type: call
  target: storage.read
  inputs:
    key: demo/settings
  output: $answer
```

## storage.write

Replace a complete record, without automatically merging objects. Required inputs: **key** (string), **value** (JSON). Returns key.

```yaml
- type: call
  target: storage.write
  inputs:
    key: demo/settings
    value:
      language: zh
  output: $answer
```

## storage.delete

Delete one record by required string **key**. Returns deleted true if removed, false if already absent. This removes saved data, so resetting fields cannot recover it.

```yaml
- type: call
  target: storage.delete
  inputs:
    key: demo/temporary
  output: $answer
```

## storage.list

List sorted keys matching a literal prefix. **prefix** is optional string, default empty (all keys). Returns keys.

```yaml
- type: call
  target: storage.list
  inputs:
    prefix: demo/
  output: $answer
```
