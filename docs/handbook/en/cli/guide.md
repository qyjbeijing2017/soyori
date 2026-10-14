# CLI usage and command reference

CLI means using Soyori through terminal commands. It suits direct YAML editing and batch runs. It shares Editor's flow rules but reads disk files, not browser Library. Start with the [CLI lesson](../quick-start-cli.md), or [Editor](../quick-start.md) if you prefer forms.

## Install the CLI

Install [Node.js 24 or newer](https://nodejs.org/en/download), including npm, then run:

```powershell
npm install -g soyori-cli
soyori --help
soyori run --help
```

Run from any folder containing your files; a source checkout and pnpm are unnecessary for normal use. Create hello.yaml:

```yaml
schemaVersion: 1
name: First run
fields:
  name:
    input: true
    initial: Alex
  chatOut:
    output: true
steps:
  - type: template
    template: Hello, $name$!
    output: $chatOut
```

Run `soyori run ./hello.yaml --set-string name=Alex --json` in the same folder. chatOut is `Hello, Alex!`. No model or key is needed. The repository's pnpm workspace is for developing Soyori itself.

## Commands

| Command | Purpose |
| --- | --- |
| run <flow-file> | Load dependencies and execute |
| inspect <flow-file> | Validate one document and list fields, steps, and references; does not load dependencies or function modules |
| validate <flow-file> | Check structure, inputs, dependencies, and targets without executing steps |
| storage info | Show effective storage/config paths and their sources |
| storage list [prefix] | List keys matching a literal prefix |
| storage get <key> | Read a record |
| storage delete <key> | Immediately delete one record |
| config set <name> <value> | Save a supported setting; currently storage-dir |
| env set <name> <value> | Save a global environment value; --sensitive obscures it |
| env list | Show the effective environment with sensitive values obscured |
| env delete <name> | Delete a persistent global environment entry |

Use --help for full command help. Storage commands accept --storage-dir and --json; config set accepts --json. See [CLI environments](../environment/cli.md). Extract a Library project to run shared flows on disk; environments, conversations, and storage remain separate.

## Flow command options

| Option | Commands | Behavior |
| --- | --- | --- |
| --json | run / inspect / validate | Versioned machine output |
| --storage-dir <directory> | All three | Override storage location |
| --env <NAME=value> | run / validate | Repeatable temporary string override, above OS and global values |
| --timeout <duration> | All three | Positive integer with ms/s/m; default 30000 ms |
| --input <file.json> | run / validate | Input object; - reads stdin until EOF |
| --input-json <json> | run / validate | Inline object; mutually exclusive with --input |
| --set <field=value> | run / validate | Repeatable; converts numbers, true, false, and null, otherwise text |
| --set-string <field=value> | run / validate | Repeatable; always literal text |
| --flows <alias=source> | run / validate | Add root imports without replacing existing aliases |
| --functions <module.mjs> | run / validate | Local ESM module with a default function-registry export |
| --trace <file.jsonl> | run | Create a new trace; refuses overwrite |
| --trace-values | run | Include limited field summaries |

Input priority: defaults → input object → set/set-string in their given order, with the last value winning. Field names are complete names, so user.name is not interpreted as a nested path. --set count=001 remains text. Nonfinite numbers and unsafe integers are rejected; use --set-string for literal text. Use JSON input for objects/lists.

PowerShell users may find --set or input files easier than inline JSON quoting. Stdin is read only with --input -.

## Load flows and modules

Entry files and imports support disk and HTTP(S). Relative imports resolve from the importer, or its final URL after redirects. Remote sources and redirects cannot access local files. Limits: 2 MiB per flow, 256 documents per graph, ten seconds per network download, and five redirects, also bounded by the overall timeout.

.yaml/.yml uses YAML 1.2 core schema; other extensions use JSON. One document per file. Duplicate or complex keys, custom tags, cycles, non-JSON data, and YAML merge keys are unsupported. Run input remains JSON.

--functions resolves relative to the command directory. Example module:

```js
export default {
  greet: ({ name }) => ({ answer: `Hello, ${name}!` }),
};
```

Call target greet with input name and map returned answer. Direct calls can use functions without tool definitions; model-visible tools need ToolDefinition. validate imports modules and therefore runs their top-level code; put business side effects inside functions. Reserved built-ins cannot be overridden.

## Machine results and errors

--json writes exactly one JSON object to stdout:

```json
{"version":1,"ok":true,"result":{"chatOut":"Hello, Alex!"}}
```

Failures use `{version:1,ok:false,error:{code,message,...}}`, with source, flowName, invocationId, path, and callStack when applicable. Logs and model progress go to stderr. Exit codes: success 0, ordinary failure 1, timeout 124, interruption 130.

Without --json, output is human-readable JavaScript-style text. JSON mode rejects non-JSON values with OUTPUT_NOT_JSON rather than silently dropping undefined. Text displays and traces are not resumable state.

## Storage settings and debugging

Save the [subflow example](../flows/subflows.md) files in the current directory before the last command:

```powershell
soyori storage info --json
soyori config set storage-dir ./agent-data --json
soyori storage list memory/ --json
soyori run ./main.yaml --trace run-002.jsonl --trace-values --timeout 30s --json
```

config changes user configuration without moving existing data. Use a new trace filename every time; --trace-values may record credentials. The worker isolates stdout and supports forced timeout termination, but is not a security sandbox and cannot roll back external effects.

See [platform support](../tools/contract.md). CLI has no browser assistant workspace/project/flow tools, persistent debugging service, or execution-resume protocol.
