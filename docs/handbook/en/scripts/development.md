# Script development

Use script.run when built-in steps do not cover a custom calculation or data transformation. It executes JavaScript ES modules and shares its input/result protocol between CLI and Editor.

## Input and output

Required code contains source; optional input is JSON, default {}. Inside the script, read global input and call result(value) with JSON output. The last result call wins; no call returns null. It does not stop execution, and a later exception still fails the call.

```yaml
- type: call
  target: script.run
  inputs:
    code: |
      const total = input.items.reduce((sum, item) => sum + item.price, 0);
      result({ total, count: input.items.length });
    input:
      items:
        - price: 2
        - price: 3
  output: $summary
```

This sums two prices and returns `{total: 5, count: 2}` into summary. Use output to save the complete value; there is no extra result wrapper. You can instead map total with outputs. Only JSON can cross the script boundary: no undefined, cycles, functions, or special objects. JavaScript reads input.count without a dollar prefix.

Each result call captures a JSON snapshot. Execution returns after module evaluation and top-level awaits complete; it does not wait for unawaited background tasks.

## Modules and a complete project

Save flow.yaml:

```yaml
schemaVersion: 1
name: Script example
fields:
  chatOut:
    output: true
steps:
  - type: call
    target: script.run
    inputs:
      code: |
        import { greet } from './lib/greet.js';
        result(greet(input.name));
      input:
        name: Alex
    output: $chatOut
```

Save lib/greet.js relative to it:

```js
export function greet(name) {
  return `Hello, ${name}!`;
}
```

Import the two-file example below. Expected output: `{chatOut: "Hello, Alex!"}`. For a file whose top-level code performs the work, code may just import './main.js'. Exporting a function alone does not call it; invoke it explicitly.

## Dependency resolution

Static imports, re-exports, string-literal dynamic imports such as await import('./module.js'), and JSON modules are supported. Computed import(variable) and user require are unsupported. The old runScript name and script input were removed.

Inline paths resolve from the calling flow; module paths resolve from that module; remote paths use the final redirected URL. Dependencies, including literal dynamic imports, are prepared before execution, so even an unvisited branch can fail for a missing module. The bundler handles reuse/cycles, and import.meta.url preserves the original source.

## Browser and CLI

| Capability | Editor | CLI |
| --- | --- | --- |
| Local modules | Library snapshot | Disk |
| HTTPS modules | Supported subject to CORS | Supported; cannot redirect to local sources |
| npm and Node built-ins | Unsupported | Local modules may use installed dependencies; no automatic install |
| TypeScript | Can save/edit, not execute as JS | Not guaranteed by the current script interface |
| Timeout | 30 seconds for loading, compiling, and executing each call | Shared whole-run CLI timeout, default 30 seconds |

Each call creates an independent Worker, terminated on completion, error, or stop. Limits: 2 MiB per module, 128 modules, 16 MiB per graph. Workers are execution boundaries, not security sandboxes for untrusted code. Network/file effects do not roll back.

## Write and debug

Test small fixed input first, then real field references. Source editing provides syntax diagnostics and import-path completion, not full type checking. Check path/case for import failures, result calls for null output, top-level awaits/infinite loops for timeout, and the full stack for later exceptions.

The assistant fully reads files/revisions, saves, inspects the calling flow, and runs the same inputs to compare results. See [assistant tools](../tools/assistant.md) and [debugging](../debugging/guide.md).
