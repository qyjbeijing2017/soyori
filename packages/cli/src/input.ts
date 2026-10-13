import { readFile } from "node:fs/promises";
import type { Assignment } from "./assignments.js";
import { CliError } from "./protocol.js";

export function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError("INVALID_JSON", `Invalid JSON in ${source}.`);
  }
}
export async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new CliError("FILE_READ_ERROR", `Cannot read ${path}.`);
  }
}
export async function readJson(path: string): Promise<unknown> {
  return parseJson(await readText(path), path);
}
export async function loadInput(
  options: {
    input?: string;
    inputJson?: string;
  },
  overrides: readonly Assignment[] = [],
): Promise<Record<string, unknown>> {
  let value: unknown = {};
  if (options.input === "-") {
    let text = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) text += chunk;
    value = parseJson(text, "stdin");
  } else if (options.input !== undefined) value = await readJson(options.input);
  else if (options.inputJson !== undefined) value = parseJson(options.inputJson, "--input-json");
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("INVALID_INPUT", "Input must be a JSON object.");
  }
  return Object.fromEntries([...Object.entries(value), ...overrides]);
}
