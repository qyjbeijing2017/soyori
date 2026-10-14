# Soyori

**English** | [简体中文](README.zh-CN.md)

[v0.1.0 — First launch](docs/releases/v0.1.0.md)

Turn your ideas into an AI assistant. Soyori helps people and AI build, run, and debug Agents through editable flows. Combine models and tools, inspect each step, and fix problems on a computer or phone. You can start with examples even if you have never written code.

This repository contains all seven packages in a single pnpm workspace. Core and CLI are ordinary package directories, with no Git submodules.

## Documentation

Read the complete Document handbook directly on GitHub: **[English](docs/handbook/README.md)** · **[简体中文](docs/handbook/README.zh-CN.md)**. These are the same chapters, screenshots, and examples used by the Editor's Document page and its assistant.

| Start here | Guide |
| --- | --- |
| Learn what Soyori does | [Introduction](docs/handbook/en/introduction.md) |
| Build your first flow | [Desktop Editor](docs/handbook/en/quick-start.md) · [Mobile Editor](docs/handbook/en/quick-start-mobile.md) · [YAML + CLI](docs/handbook/en/quick-start-cli.md) |
| Remember a conversation | [Lesson 2: Memory](docs/handbook/en/quick-start-memory.md) |
| Let an assistant use tools | [Lesson 3: Tools](docs/handbook/en/quick-start-tools.md) |
| Look up a command | [CLI reference](docs/handbook/en/cli/guide.md) |

The handbook includes Editor and YAML screenshots, runnable examples, expected results, and platform limits. Its contents pages link directly to example files, so you can browse them without starting the Editor.

## What you can do

- Edit fields and steps, run flows, and inspect execution one step at a time.
- Chat with your own Agent or use the built-in assistant to read documentation, manage Library files, create flows, and test saved flows.
- Use shared model tools, including `llm.auto`, with OpenAI-compatible, Anthropic, or local models.
- Build explicit tool loops and conversation memory using ordinary, editable steps.
- Use JSON storage, token counting, JavaScript scripts, and basic tools from CLI and Editor.

The product principle is **simple presets, capable underlying steps**. Flows stay sequential and understandable; the Editor uses step lists and nested blocks. Memory and compression are composed in flows. Runtime state is not automatically saved for later resumption. Preset presentation and upgrade mechanisms remain future work.

Soyori's longer-term direction is to support humanlike digital life; the current product focuses on an understandable, editable, and verifiable Agent workbench. For development context, read [Project goals and decisions](docs/project-context.md) and [AI tools and presets](docs/ai-tools-and-presets.md). Developer design notes are currently in Chinese; [AGENTS.md](AGENTS.md) is the AI collaboration entry point.

## Install the CLI

Install [Node.js 24 or newer](https://nodejs.org/), including npm, then run:

```sh
npm install -g soyori-cli
soyori --help
soyori run ./translate.yaml --json --timeout 10m
```

Create `translate.yaml` using the [YAML + CLI quick start](docs/handbook/en/quick-start-cli.md). You do not need pnpm or the source repository. Model files are downloaded on demand and are not included in npm packages. Public packages use the `soyori-*` names and the [MIT license](LICENSE).

The published `0.1.0` packages predate the current `memory` tool interface. The memory and Agent tool-loop lessons explain how to use the source-built CLI until a newer release. See [npm packaging and release records](docs/npm-release.md) for release status and verification.

## Develop from source

Use Node.js 24 or newer and the pnpm version pinned in the root `package.json`.

```sh
git clone https://github.com/qyjbeijing2017/soyori.git
cd soyori
pnpm install --frozen-lockfile
pnpm build
pnpm verify
```

Start the local web Editor:

```sh
pnpm editor
```

Open the local URL printed by Vite. All packages share the root `pnpm-lock.yaml`; use commands such as `pnpm --filter soyori-core typecheck` to check an individual package. There is no separate Core or CLI checkout.

```text
soyori/
├─ packages/
│  ├─ core/              # Shared flow semantics and runtime
│  ├─ cli/               # Command-line host
│  ├─ editor/            # Web editor and debugging workbench
│  ├─ ai/                # Shared model and memory tools
│  ├─ storage/           # Storage and runtime environment
│  ├─ script/            # Script contract and module preparation
│  └─ tools/             # Shared basic tools
├─ docs/
├─ examples/
├─ scripts/
├─ pnpm-workspace.yaml
└─ pnpm-lock.yaml
```

## Run the CLI from this checkout

After building, run these commands from the repository root:

```sh
pnpm cli --help
pnpm cli run examples/add-one.json --input examples/input.json --json
pnpm cli run examples/parent.json --input examples/input.json --json
pnpm cli run examples/function.json --functions examples/functions.mjs --json
pnpm cli run examples/add-one.yaml --set count=2 --json
pnpm cli run examples/parent.yaml --json
pnpm cli inspect examples/parent.json --json
pnpm cli validate examples/parent.json --json
pnpm cli run examples/parent.json --trace trace.jsonl --timeout 30s --json
pnpm cli run examples/object-values.json --json
```

The first two flow runs return `{ "count": 3 }`; the external-function example returns `{ "message": "Hello, Agent!" }`. JSON success is `{ "version": 1, "ok": true, "result": ... }`; failure is `{ "version": 1, "ok": false, "error": ... }`.

Flows support `.json`, `.yaml`, and `.yml`, including mixed formats across subflows. The CLI parses files and delegates validation to Core. Inputs remain JSON and the output protocol is unchanged. See the [YAML example](examples/add-one.yaml) and [CLI reference](docs/handbook/en/cli/guide.md).

Flow `imports` resolve relative to the importing file; remote imports resolve relative to the final URL after redirects. `--flows alias=source` adds a root reference. `--functions` loads a local ESM module relative to the command directory. See [distribution rules](packages/core/docs/distribution.md).

For manual input, repeat `--set name=value`; use `--set-string` to force text. Flows, fields, and steps accept optional descriptions, visible through `inspect` and step traces. [Field references](docs/handbook/en/flows/operands.md) use `$` paths; constants use JSON values, and `append` adds one item. The current format keeps `schemaVersion: 1` and does not accept old bare field references.

Default text output uses Node's inspector and can display `undefined`, binary values, and cycles. `--json` requires JSON-compatible results. JSON errors go to stdout, text errors to stderr, and host logs always to stderr. Exit codes are 1 for ordinary failures, 124 for timeout, and 130 for interruption. The CLI supports `run`, `inspect`, `validate`, file/inline/stdin input, traces, and isolated execution timeouts; see the [developer CLI documentation](packages/cli/README.md).

## Package responsibilities

| Package | Responsibility |
| --- | --- |
| [core](packages/core/README.md) | The single implementation of flow validation, fields, steps, runtime, call stacks, and external-function execution. Does not depend on CLI. |
| [cli](packages/cli/README.md) | Arguments, file loading, function modules, output, and exit codes; uses Core's public API. |
| [ai](packages/ai/README.md) | Shared model calls, local models, memory tools, and token counting. |
| [storage](packages/storage/README.md) | Generic storage, user configuration, and runtime environments. |
| script | Shared JavaScript module contract and Worker execution. See [scripts and workspace](docs/scripts-and-workspace.md). |
| [tools](packages/tools/README.md) | Shared basic tools and host registration. |
| [editor](packages/editor/README.md) | Browser Library, step editing, Agent chat, built-in assistant, and handbook. |

## Contributing and verification

All source, documentation, and cross-package changes belong to this Git repository. Update the root lockfile for dependency changes. Do not commit `node_modules`, `dist`, `output/`, temporary files, or credentials. Independent npm packages are released in dependency order; see [npm packaging](docs/npm-release.md).

`pnpm verify` runs Biome, type checks, and all tests. `pnpm format` applies formatting. GitHub Actions checks the same checkout on Windows and Linux, including packaging and installation outside the workspace. The old `agent-plan-core` and `agent-plan-cli` repositories are historical sources, not current dependencies.

The two GitHub handbook contents pages are generated from the existing language catalogs. After changing a catalog, run `node scripts/handbook-index.mjs`; verify they are current with `node scripts/handbook-index.mjs --check`. Maintain both README languages together.

Further developer notes: [assistant and browser execution](docs/editor-assistant.md), [basic tools](docs/basic-tools.md), [memory tools](docs/memory-tools.md), [model tool calling](docs/tool-calling.md), and [storage and tokens](docs/storage-and-tokens.md).
