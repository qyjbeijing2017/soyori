# Tool execution and scripts

These interfaces are shared by CLI and Editor; see [platform support](contract.md).

## Before you start

Pass model requests to tools.execute, then pass its results to memory.addTools. Execution does not update history automatically. Omitted tools adds no extra allowlist; [] forbids every target. Request inputs are prepared JSON and are not reinterpreted for dollar references.

Each request returns result on success or error on failure. Cancellation/budget exhaustion also records remaining requests as errors. Shared limits per run: 64 model calls, 64 tool calls, 32 requests per batch, 2000 steps per tool subflow, and 8 execution nesting levels.

script.run returns the whole JSON value set by result(value). Without a call it returns null; the last call wins. result does not stop execution, so later exceptions still fail the script. See [script development](../scripts/development.md).

The following are [step fragments](reference.md#how-to-read-tool-documentation) using an answer field.

## script.run

Execute a JavaScript ES module with global input and result.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| code | string | Required | JavaScript ES module source |
| input | JSON | Optional, {} | Data available as input, for example input.count |

This returns the number 3 directly, **not {result: 3}**. Use output to save it.

```yaml
- type: call
  target: script.run
  inputs:
    code: result(input.count + 1);
    input:
      count: 2
  output: $answer
```

## tools.execute

Execute model-requested tools and return each outcome for memory.addTools.

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| calls | JSON | Yes | Request list, each with id, target, inputs |
| tools | string[] | No | Allowed targets; omitted means no extra restriction, [] allows none |

Returns `{results: [{id: "one", target: "math.abs", result: {result: 2}}]}`. Failures have error instead of result. Map results or save the complete object.

```yaml
- type: call
  target: tools.execute
  inputs:
    calls:
      - id: one
        target: math.abs
        inputs:
          value: -2
    tools:
      - math.abs
  output: $answer
```
