#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspect, parseArgs } from "node:util";
import { createRuntime } from "agent-plan-core";
import type { FlowDefinition, RuntimeFunction } from "agent-plan-core";

const help = `Usage: agent-plan run <flow.json> [options]

Options:
  --input <file.json>       Input parameter object
  --flows <flow.json>       Additional subflow (repeatable)
  --functions <module.mjs>  Local module with a default function-registry export
  --json                   Emit JSON (fails for non-JSON runtime values)
  -h, --help               Show help

Paths are relative to the current working directory.
Without --json, output uses Node's inspector, including binary and undefined values.
`;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Cannot load ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Reject lossy JSON output instead of silently dropping binary/undefined values. */
function checkJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new Error("Output is not JSON-compatible. Omit --json to inspect the runtime value.");
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if ((!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
    || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error("Output is not JSON-compatible. Omit --json to inspect the runtime value.");
  }
  ancestors.add(value);
  try {
    const items: unknown[] = Array.isArray(value) ? Array.from(value) : Object.values(value);
    for (const item of items) checkJson(item, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      input: { type: "string" },
      flows: { type: "string", multiple: true },
      functions: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return;
  }
  if (positionals[0] !== "run" || positionals.length !== 2) {
    throw new Error("Expected: agent-plan run <flow.json>. Use --help for options.");
  }
  const definition = await readJson(positionals[1]!) as FlowDefinition;
  const inputs = values.input === undefined ? {} : await readJson(values.input);
  if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw new Error("Input file must contain a JSON object.");
  }
  const flows = await Promise.all((values.flows ?? []).map(async (path) => await readJson(path) as FlowDefinition));
  let functions: Record<string, RuntimeFunction> = {};
  if (values.functions !== undefined) {
    const module = await import(pathToFileURL(resolve(values.functions)).href) as { default?: unknown };
    const registry = module.default;
    if (registry === null || typeof registry !== "object" || Array.isArray(registry)) {
      throw new Error("Function module must default-export an object of functions.");
    }
    functions = registry as Record<string, RuntimeFunction>;
  }
  // The core validates definitions, mappings and function registrations.
  const runtime = createRuntime(definition, inputs as Record<string, unknown>, { flows, functions });
  const state = await runtime.run();
  if (state.status === "failed") {
    const error = state.error!;
    throw new Error(`${error.code}: ${error.message} (${error.flowId ?? definition.id}:${error.path})`);
  }
  if (values.json) {
    checkJson(state.output);
    process.stdout.write(`${JSON.stringify(state.output, null, 2)}\n`);
  } else {
    process.stdout.write(`${inspect(state.output, { depth: null, colors: false })}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`agent-plan: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
