import type { JsonValue, RuntimeFailure } from "soyori-core";
import { RuntimeError, toJsonValue } from "soyori-core";

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Failure = Omit<RuntimeFailure, "code" | "path"> & { code: string; path?: string };
export type Reply =
  | { version: 1; ok: true; result: JsonValue }
  | { version: 1; ok: false; error: Failure };

export function failure(error: unknown): Failure {
  if (error instanceof RuntimeError)
    return {
      code: error.code,
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
      ...(error.field === undefined ? {} : { field: error.field }),
      ...(error.flowName === undefined ? {} : { flowName: error.flowName }),
      ...(error.source === undefined ? {} : { source: error.source }),
    };
  let message = "Unknown error";
  try {
    message = error instanceof Error ? error.message : String(error);
  } catch {
    /* Arbitrary host exceptions. */
  }
  return { code: error instanceof CliError ? error.code : "CLI_ERROR", message };
}

export function success(value: unknown): Reply {
  try {
    return { version: 1, ok: true, result: toJsonValue(value) };
  } catch {
    throw new CliError(
      "OUTPUT_NOT_JSON",
      "Output is not JSON-compatible. Omit --json to inspect runtime values.",
    );
  }
}

export function formatFailure(error: Failure): string {
  const location =
    error.source || error.flowName || error.path
      ? ` (${error.source ?? error.flowName ?? "flow"}:${error.path ?? ""})`
      : "";
  return `soyori: ${error.code}: ${error.message}${location}\n`;
}

export interface Request {
  environment?: Record<string, { value: string; sensitive: boolean }>;
  storageDir?: string;
  command: "run" | "validate" | "inspect";
  file: string;
  input: Record<string, unknown>;
  flows: string[];
  functions?: string;
  json: boolean;
  trace: boolean;
  traceValues: boolean;
}
export type WorkerMessage =
  | { type: "progress"; message: string }
  | { type: "result"; reply: Reply; text?: string }
  | { type: "trace"; record: Record<string, unknown> };
