import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import type { Assignment } from "./assignments.js";
import { parseAssignment } from "./assignments.js";
import { addEnvironmentCommands } from "./environment-commands.js";
import { loadInput } from "./input.js";
import type { Request } from "./protocol.js";
import { CliError, failure, formatFailure } from "./protocol.js";
import { runIsolated } from "./runner.js";
import { addStorageCommands } from "./storage-commands.js";
import { storageLocation } from "./storage-config.js";

function duration(value: string): number {
  const match = /^(\d+)(ms|s|m)?$/.exec(value);
  const multiplier = match?.[2] === "m" ? 60_000 : match?.[2] === "s" ? 1000 : 1;
  const result = Number(match?.[1]) * multiplier;
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2_147_483_647)
    throw new InvalidArgumentError("Expected a positive duration, e.g. 500ms, 30s, 2m.");
  return result;
}
interface Options {
  storageDir?: string;
  env?: string[];
  input?: string;
  inputJson?: string;
  flows: string[];
  functions?: string;
  json?: boolean;
  trace?: string;
  traceValues?: boolean;
  timeout: number;
}

export async function main(): Promise<void> {
  let machine = process.argv.slice(2).includes("--json");
  const program = new Command()
    .name("soyori")
    .description("Run and inspect Soyori flows.")
    .exitOverride();
  program.configureOutput({ writeErr: () => {} });
  addStorageCommands(program);
  addEnvironmentCommands(program);
  for (const name of ["run", "inspect", "validate"] as const) {
    const overrides: Assignment[] = [];
    const command = program
      .command(name)
      .argument("<flow-file>", "Flow file or HTTP(S) URL (.json, .yaml or .yml)")
      .option("--json", "Emit versioned JSON result or error")
      .option("--storage-dir <directory>", "Override local JSON storage root")

      .addOption(
        new Option("--timeout <duration>", "Execution limit (includes script downloading/loading)")
          .env(
            process.env.SOYORI_TIMEOUT !== undefined || process.env.AGENT_PLAN_TIMEOUT === undefined
              ? "SOYORI_TIMEOUT"
              : "AGENT_PLAN_TIMEOUT",
          )
          .argParser(duration)
          .default(30_000),
      );
    if (name !== "inspect") {
      command
        .addOption(
          new Option("--input <file.json>", "Input object file; - reads stdin").conflicts(
            "inputJson",
          ),
        )
        .addOption(new Option("--input-json <json>", "Inline input object").conflicts("input"))
        .option(
          "--set <field=value>",
          "Override input with a number, boolean, null or text (repeatable)",
          (value: string) => {
            overrides.push(parseAssignment(value));
            return overrides;
          },
        )
        .option(
          "--set-string <field=value>",
          "Override input as literal text (repeatable)",
          (value: string) => {
            overrides.push(parseAssignment(value, true));
            return overrides;
          },
        )
        .option(
          "--flows <key=source>",
          "Additional root import, relative to the root flow (repeatable)",
          (value: string, previous: string[]) => [...previous, value],
          [],
        )
        .option("--functions <module.mjs>", "Local module with default function-registry export");
    }
    if (name !== "inspect")
      command.option(
        "--env <NAME=value>",
        "Temporary environment override (repeatable; string values)",
        (value: string, previous: string[]) => {
          const position = value.indexOf("=");
          if (
            position < 1 ||
            !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.slice(0, position)) ||
            ["__proto__", "constructor", "prototype"].includes(value.slice(0, position))
          )
            throw new CliError("INVALID_ARGUMENT", "Expected a valid environment NAME=value.");
          return [...previous, value];
        },
        [],
      );
    if (name === "run")
      command
        .option("--trace <file.jsonl>", "Create execution trace (file must not exist)")
        .option("--trace-values", "Include bounded field summaries (may contain secrets)");
    command.action(async (file: string, options: Options) => {
      machine = options.json === true;
      if (options.traceValues && !options.trace)
        throw new CliError("INVALID_ARGUMENT", "--trace-values requires --trace.");
      const request: Request = {
        command: name,
        storageDir: (await storageLocation(options.storageDir)).directory,
        environment: Object.fromEntries(
          (options.env ?? []).map((value) => {
            const position = value.indexOf("=");
            return [
              value.slice(0, position),
              { value: value.slice(position + 1), sensitive: true },
            ];
          }),
        ),
        file,
        input: await loadInput(options, overrides),
        flows: options.flows ?? [],
        ...(options.functions === undefined ? {} : { functions: options.functions }),
        json: machine,
        trace: options.trace !== undefined,
        traceValues: options.traceValues === true,
      };
      const result = await runIsolated(request, options.timeout, options.trace);
      if (machine) process.stdout.write(`${JSON.stringify(result.reply)}\n`);
      else if (result.reply.ok) process.stdout.write(`${result.text ?? ""}\n`);
      else process.stderr.write(formatFailure(result.reply.error));
      if (!result.reply.ok)
        process.exitCode =
          result.reply.error.code === "TIMEOUT"
            ? 124
            : result.reply.error.code === "INTERRUPTED"
              ? 130
              : 1;
    });
  }
  try {
    if (process.argv.length === 2) program.outputHelp();
    else await program.parseAsync(process.argv);
  } catch (error: unknown) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const detail =
      error instanceof CommanderError
        ? { code: "INVALID_ARGUMENT", message: error.message }
        : failure(error);
    if (machine)
      process.stdout.write(`${JSON.stringify({ version: 1, ok: false, error: detail })}\n`);
    else process.stderr.write(formatFailure(detail));
    process.exitCode = 1;
  }
}
