# Soyori Document — User handbook

**English** | [简体中文](README.zh-CN.md) | [Project README](../../README.md)

Read the same handbook used by the Editor's Document page and built-in assistant, directly on GitHub. All chapter, screenshot, and example links are relative to this repository.

Start with a desktop, mobile, or CLI quick start, then continue with memory and tools. Use the Examples links to read complete files. On a GitHub file page, use Raw or Download raw file to save a copy; keep the relative paths of multi-file examples. In the Editor, the chapter's Import example button copies these files into Library.

[Official website / Online Editor](https://soyori.joycows.com) · [Online handbook](https://soyori.joycows.com/#document/introduction). Choose English or Chinese in Settings. Report bugs through [GitHub Issues](https://github.com/qyjbeijing2017/soyori/issues); for other contact details, see the [introduction](en/introduction.md).

<!-- Generated from index.json and en/index.json by scripts/handbook-index.mjs. -->

## Getting started

| Chapter | Covers | Examples |
| --- | --- | --- |
| [What is Soyori?](en/introduction.md) | What Soyori does, how Agents work, and where to start reading. | — |
| [Quick start: Editor](en/quick-start.md) | Create a desktop flow with fields, a text template, and a model call. | — |
| [Quick start: Editor on mobile](en/quick-start-mobile.md) | Build the same translation assistant using the phone layout. | — |
| [Quick start: YAML + CLI](en/quick-start-cli.md) | Write and run a translation flow with YAML and terminal commands. | — |
| [Quick start 2: Using memory](en/quick-start-memory.md) | Read and save message history so an assistant remembers earlier turns. | [Lesson 2: Memory assistant](en/examples/quick-memory/memory-chat.yaml) |
| [Quick start 3: Using tools](en/quick-start-tools.md) | Call a time tool directly, then let AI request and use its real results. | [Lesson 3: Direct time query](en/examples/quick-tools/time-tool.yaml) · [Lesson 3: AI time assistant](en/examples/quick-tools-agent/tool-agent.yaml) |

## 1. Flows

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Overview](en/flows/language.md) | Understand flows, fields, steps, and the basic YAML file structure. | [Fields: Constants](en/examples/constants/constants.yaml) |
| [Fields: Types](en/flows/types.md) | Why types matter, how they are detected, and why you need not learn them first. | [Fields: Constants](en/examples/constants/constants.yaml) · [Fields: Objects and lists](en/examples/objects/objects.yaml) |
| [Fields: Constants](en/flows/constants.md) | Use fixed values in field defaults and step inputs. | [Fields: Constants](en/examples/constants/constants.yaml) |
| [Fields: Variables](en/flows/variables.md) | Declare named fields, read their current values, and save results. | [Fields: Variables](en/examples/variables/variables.yaml) |
| [Fields: Objects and lists](en/flows/objects.md) | Store named details in objects and ordered items in lists. | [Fields: Objects and lists](en/examples/objects/objects.yaml) |
| [Steps: Field operations](en/flows/assignment.md) | Replace a value or append one item for later steps to use. | [Steps: Field operations](en/examples/assignment/assignment.yaml) |
| [Steps: Flow control](en/flows/control.md) | Choose branches with If and repeat actions with While. | [Steps: Flow control](en/examples/control/control.yaml) |
| [Steps: Text processing](en/flows/text.md) | Combine fixed text with field values to build prompts and replies. | [Steps: Text processing](en/examples/text/text.yaml) |
| [Steps: Arithmetic](en/flows/math.md) | Add, subtract, multiply, and divide, saving the result to a field. | [Steps: Arithmetic](en/examples/math/math.yaml) |
| [Steps: Comparisons](en/flows/comparison.md) | Compare equality or numeric order and produce a true/false result. | [Steps: Comparisons](en/examples/comparison/comparison.yaml) |
| [Steps: Logic](en/flows/logic.md) | Combine conditions using And, Or, and Not. | [Steps: Logic](en/examples/logic/logic.yaml) |
| [Steps: Calls](en/flows/calling.md) | Choose a tool or subflow, supply inputs, and map returned values. | [Steps: Calls](en/examples/calling/calling.yaml) |
| [Steps: Groups and descriptions](en/flows/groups.md) | Organize fields and steps into collapsible groups with descriptions. | [Steps: Groups and descriptions](en/examples/groups/groups.yaml) |
| [Fields and data paths](en/flows/operands.md) | Look up references, escapes, templates, nested writes, and path limits. | — |
| [Subflows and calls](en/flows/subflows.md) | Reuse a flow through local imports, inputs, outputs, and nested debugging. | [Subflow calls](en/examples/subflows/main.yaml) |

## 2. Editor

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Chat: Assistants, threads, and execution records](en/editor/chat.md) | Choose an Agent, manage conversations, and inspect execution records. | — |
| [Library: Files, uploads, and downloads](en/workspace.md) | Organize browser files, edit source, upload, and export projects. | — |
| [Editing flows: Fields and current values](en/editor/values.md) | Configure fields and distinguish saved defaults from current test values. | — |
| [Editing flows: Steps, source, and saving](en/editor/flow.md) | Edit ordered and nested steps, change source, and save the intended version. | — |
| [Running and debugging](en/debugging/guide.md) | Step through a run, locate errors, inspect nested calls, and record CLI traces. | [Fix division by zero](en/examples/debugging/broken.yaml) |
| [Settings: Models and saved data](en/editor/settings.md) | Configure model connections, prepare local inference, and back up browser data. | — |

## 3. CLI

| Chapter | Covers | Examples |
| --- | --- | --- |
| [CLI usage and command reference](en/cli/guide.md) | Install the CLI and look up commands, options, loading rules, output, and traces. | — |

## 4. Environment variables

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Environment variables and sensitive values](en/agents/environment.md) | Understand environment scope, precedence, model connections, and sensitive values. | — |
| [Environment variables: CLI](en/environment/cli.md) | Combine global, OS, and command settings; load JSON or override within a run. | — |
| [Environment variables: Editor](en/environment/editor.md) | Configure global, conversation, and file-test environments with screenshots. | — |

## 5. Built-in tools

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Tool contracts and platform support](en/tools/contract.md) | Tool definitions, calling rules, discovery, and actual CLI/Editor support. | — |
| [Built-in tool reference](en/tools/reference.md) | Learn input and output mappings, then find tools by capability. | — |
| [Math, text, and lists](en/tools/basic.md) | Individual math, text, and list tools with parameters, results, and examples. | — |
| [Time and web](en/tools/web.md) | Query time, make HTTP requests, and configure Mwmbl, Tavily, or Bocha search. | [Test a search provider](en/examples/web-search/search.yaml) |
| [Storage and tokens](en/tools/storage.md) | Read and write JSON records, list keys, and distinguish token counts from estimates. | — |
| [Memory orchestration](en/tools/memory.md) | Initialize history, add messages and tool results, and save complete memory. | — |
| [Model calls](en/tools/models.md) | Call local, OpenAI-compatible, Anthropic, or automatically selected models. | — |
| [Runtime environment](en/tools/environment.md) | Read runtime values, override or load settings, and inspect assistant environments. | — |
| [Tool execution and scripts](en/tools/execution.md) | Return JavaScript results and execute model-requested tools with shared limits. | — |
| [Assistant file and debugging tools](en/tools/assistant.md) | Handbook access, tool discovery, Library operations, and saved-flow verification. | — |

## 6. Scripts

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Script development](en/scripts/development.md) | Use JavaScript input/result, import modules, and debug across browser and CLI. | [Scripts and modules](en/examples/scripts/flow.yaml) |

## 7. Agent examples

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Models and Agent tool loops](en/agents/models.md) | Compose model calls, actual tool execution, message history, and an explicit loop. | [Models, tool loops, and memory](en/examples/agent/agent.yaml) |
| [Storage and conversation memory](en/agents/storage.md) | Distinguish live fields, transcripts, and flow memory; understand storage and tokens. | — |

## Appendix

| Chapter | Covers | Examples |
| --- | --- | --- |
| [Architecture and capability boundaries](en/architecture.md) | Package responsibilities, public Core APIs, documentation, and platform boundaries. | — |

## Complete example files

| Example | Entry flow | All files |
| --- | --- | --- |
| Single-turn translator | [translate.yaml](en/examples/translate/translate.yaml) | [translate.yaml](en/examples/translate/translate.yaml) |
| Your first flow | [hello.yaml](en/examples/hello/hello.yaml) | [hello.yaml](en/examples/hello/hello.yaml) |
| Loop counter | [counter.yaml](en/examples/counter/counter.yaml) | [counter.yaml](en/examples/counter/counter.yaml) |
| Subflow calls | [main.yaml](en/examples/subflows/main.yaml) | [main.yaml](en/examples/subflows/main.yaml) · [add-one.yaml](en/examples/subflows/add-one.yaml) |
| Scripts and modules | [flow.yaml](en/examples/scripts/flow.yaml) | [flow.yaml](en/examples/scripts/flow.yaml) · [lib/greet.js](en/examples/scripts/lib/greet.js) |
| Fix division by zero | [broken.yaml](en/examples/debugging/broken.yaml) | [broken.yaml](en/examples/debugging/broken.yaml) · [fixed.yaml](en/examples/debugging/fixed.yaml) |
| Fields: Constants | [constants.yaml](en/examples/constants/constants.yaml) | [constants.yaml](en/examples/constants/constants.yaml) |
| Fields: Variables | [variables.yaml](en/examples/variables/variables.yaml) | [variables.yaml](en/examples/variables/variables.yaml) |
| Fields: Objects and lists | [objects.yaml](en/examples/objects/objects.yaml) | [objects.yaml](en/examples/objects/objects.yaml) |
| Steps: Field operations | [assignment.yaml](en/examples/assignment/assignment.yaml) | [assignment.yaml](en/examples/assignment/assignment.yaml) |
| Steps: Flow control | [control.yaml](en/examples/control/control.yaml) | [control.yaml](en/examples/control/control.yaml) |
| Steps: Text processing | [text.yaml](en/examples/text/text.yaml) | [text.yaml](en/examples/text/text.yaml) |
| Steps: Arithmetic | [math.yaml](en/examples/math/math.yaml) | [math.yaml](en/examples/math/math.yaml) |
| Steps: Comparisons | [comparison.yaml](en/examples/comparison/comparison.yaml) | [comparison.yaml](en/examples/comparison/comparison.yaml) |
| Steps: Logic | [logic.yaml](en/examples/logic/logic.yaml) | [logic.yaml](en/examples/logic/logic.yaml) |
| Steps: Calls | [calling.yaml](en/examples/calling/calling.yaml) | [calling.yaml](en/examples/calling/calling.yaml) |
| Steps: Groups and descriptions | [groups.yaml](en/examples/groups/groups.yaml) | [groups.yaml](en/examples/groups/groups.yaml) |
| Models, tool loops, and memory | [agent.yaml](en/examples/agent/agent.yaml) | [agent.yaml](en/examples/agent/agent.yaml) |
| Lesson 2: Memory assistant | [memory-chat.yaml](en/examples/quick-memory/memory-chat.yaml) | [memory-chat.yaml](en/examples/quick-memory/memory-chat.yaml) |
| Lesson 3: Direct time query | [time-tool.yaml](en/examples/quick-tools/time-tool.yaml) | [time-tool.yaml](en/examples/quick-tools/time-tool.yaml) |
| Lesson 3: AI time assistant | [tool-agent.yaml](en/examples/quick-tools-agent/tool-agent.yaml) | [tool-agent.yaml](en/examples/quick-tools-agent/tool-agent.yaml) |
| Test a search provider | [search.yaml](en/examples/web-search/search.yaml) | [search.yaml](en/examples/web-search/search.yaml) |
