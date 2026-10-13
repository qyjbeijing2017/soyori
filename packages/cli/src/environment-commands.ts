import { join } from "node:path";
import { inspect } from "node:util";
import type { Command } from "commander";
import {
  effectiveEnvironment,
  loadEnvironment,
  saveEnvironment,
  validateEnvironmentName,
} from "soyori-storage/environment";
import { createFileStorage } from "soyori-storage/node";
import { success } from "./protocol.js";
import { storageLocation } from "./storage-config.js";

export function addEnvironmentCommands(program: Command) {
  const root = program
    .command("env")
    .description("Manage global environment values (stored locally, not encrypted)");
  for (const action of ["list", "set", "delete"] as const) {
    const command = root
      .command(action)
      .option("--storage-dir <directory>", "Storage root")
      .option("--json", "Emit versioned JSON");
    if (action !== "list") command.argument("<name>");
    if (action === "set") command.argument("<value>").option("--sensitive", "Mask in env list");
    command.action(async (...args: unknown[]) => {
      const options = command.opts<{
        storageDir?: string;
        json?: boolean;
        sensitive?: boolean;
      }>();
      const store = createFileStorage(
        join((await storageLocation(options.storageDir)).directory, ".environment"),
      );
      let result: unknown;
      if (action === "list") {
        const values = {
          ...(await effectiveEnvironment(store)),
          ...Object.fromEntries(
            Object.entries(process.env)
              .filter(
                ([name, value]) =>
                  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) &&
                  !["__proto__", "constructor", "prototype"].includes(name) &&
                  typeof value === "string",
              )
              .map(([name, value]) => [name, { value: value!, sensitive: true }]),
          ),
        };
        result = Object.fromEntries(
          Object.entries(values).map(([name, entry]) => [
            name,
            {
              ...entry,
              value: entry.sensitive ? "[sensitive]" : entry.value,
              source: Object.hasOwn(process.env, name) ? "system" : "global",
              status: entry.value === "" ? "empty" : "set",
            },
          ]),
        );
      } else {
        const name = args[0];
        validateEnvironmentName(name);
        const values = await loadEnvironment(store);
        if (action === "set")
          values[name] = { value: args[1] as string, sensitive: options.sensitive === true };
        else delete values[name];
        await saveEnvironment(store, values);
        result = { name, scope: "global", action };
      }
      process.stdout.write(
        `${options.json ? JSON.stringify(success(result)) : inspect(result, { depth: null, colors: false })}\n`,
      );
    });
  }
}
