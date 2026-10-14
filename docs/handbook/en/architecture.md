# Architecture and capability boundaries

This developer reference helps locate responsibility in a flow, tool, host, or UI. You do not need runtime internals for everyday use; start with the [quick start](quick-start.md). Current development focuses on shared CLI/Editor foundations; embedding SDK work is deferred.

## Packages and responsibilities

| Package | Responsibility |
| --- | --- |
| soyori-core | Validation, operands, fields, steps, scheduling, subflows, state, errors |
| soyori-cli | Disk/HTTP loading, arguments, host registration, workers, trace, output, exits |
| soyori-editor | IndexedDB Library, forms/source UI, Chat, browser host, debugger |
| soyori-ai | Model integration, messages, tool bridge, budgets |
| soyori-tools | Shared time, web, math, text, and list tools |
| soyori-storage | JSON storage and platform backends |
| soyori-script | Script checks, module preparation, shared protocol; hosts provide execution |

Core reads no disk, network, or credentials and embeds no model SDK. Hosts load dependencies/register tools, then delegate to the one flow engine.

## From file to result

Host parses JSON/YAML → Core parseFlow validates → host links imports as LoadedFlow → createRuntime receives graph, inputs, functions → step/run advances → getState provides output/error.

Runtime creation copies and validates the definition graph; later source-definition edits do not change the active run. Field containers are separate, while inputs/returns can preserve references, so live state need not be JSON-serializable.

## Current public Core API

Exports include parseFlow, inspectFlow, createRuntime, and tool-definition helpers. Runtime supports step, run, getState, getStack, setFields, reset. Only the root can reset; old child instances become invalidated.

step on an active chain advances its top. Root run continues until root completion; child run continues until that child finishes. A busy scheduler cannot be advanced or have fields changed concurrently. State includes ready/running/waiting/completed/failed/invalidated, busy, fields, nextStepPath, and output/error.

Hosts/tools own timeout, cancellation, and retry boundaries; Core does not implement them automatically. There are no resumable snapshots, arbitrary execution jumps, shared remote sessions, or complete unified pause protocol.

## Document and the assistant

Handbook sources are under docs/handbook, with English counterparts under docs/handbook/en. Small catalogs load with the app; chapters and each language's full-text index load on demand. Document and project.docs share the selected language and stable chapter IDs. Project direction/history are separate from the user handbook.

The assistant reads docs/files and verifies saved versions with flow.inspect/run. Actual successful tools are evidence of actions; generated text alone is not. Controlling live Editor sessions would require a new shared interface.

## Platforms and releases

Browser networking follows CORS and uses Library/IndexedDB; CLI uses disk/user storage. Script execution also differs. See the [matrix](tools/contract.md) before porting.

Development packages use soyori-* names with pnpm workspace dependencies and remain private in the workspace. Release generation produces six public packages: soyori-core, soyori-storage, soyori-script, soyori-tools, soyori-ai, soyori-cli, with exact internal release versions. Users install CLI via npm install -g soyori-cli. Editor remains a separate web app, outside the CLI package.

All packages/* sources are in one Git repository; Core/CLI are no longer submodules. Native Windows/macOS/iOS/Android wrappers, directory synchronization, MCP, and shared remote debugging are outside current implemented capabilities.
