import { inspect } from "node:util";
import type { Command } from "commander";
import { createFileStorage } from "soyori-storage/node";
import { success } from "./protocol.js";
import { setStorageDirectory, storageLocation } from "./storage-config.js";

function output(value: unknown, json?: boolean) {
  process.stdout.write(
    `${json ? JSON.stringify(success(value)) : inspect(value, { depth: null, colors: false })}\n`,
  );
}
export function addStorageCommands(program: Command) {
  const storage = program.command("storage").description("Manage JSON documents in local storage");
  for (const name of ["info", "list", "get", "delete"] as const) {
    const command = storage
      .command(name)
      .option("--storage-dir <directory>", "Override storage root")
      .option("--json", "Emit versioned JSON");
    if (name === "list") command.argument("[prefix]", "Key prefix", "");
    if (name === "get" || name === "delete") command.argument("<key>");
    command.action(async (...args: unknown[]) => {
      const options = command.opts<{ storageDir?: string; json?: boolean }>();
      const location = await storageLocation(options.storageDir);
      const store = createFileStorage(location.directory);
      const key = args[0] as string;
      const result =
        name === "info"
          ? location
          : name === "list"
            ? await store.list(key)
            : name === "get"
              ? await store.read(key)
              : await store.delete(key);
      output(result, options.json);
    });
  }
  program
    .command("config")
    .description("Manage user configuration")
    .command("set")
    .argument("<name>")
    .argument("<value>")
    .option("--json", "Emit versioned JSON")
    .action(async (name: string, value: string, options: { json?: boolean }) => {
      if (name !== "storage-dir") throw new Error("Only storage-dir is supported.");
      output(await setStorageDirectory(value), options.json);
    });
}
