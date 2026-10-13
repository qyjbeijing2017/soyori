import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { atomicWrite } from "soyori-storage/node";

export function configPath() {
  // Keep the existing location so renaming does not disconnect user configuration.
  const home = homedir();
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || join(home, "AppData", "Roaming")
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME || join(home, ".config");
  return join(base, "agent-plan", "config.json");
}
function defaultDirectory() {
  const home = homedir();
  const base =
    process.platform === "win32"
      ? process.env.LOCALAPPDATA || join(home, "AppData", "Local")
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : process.env.XDG_DATA_HOME || join(home, ".local", "share");
  return join(base, "agent-plan", "storage");
}
async function readConfig(): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(configPath(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  const config: unknown = JSON.parse(text);
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Invalid config.json: expected an object.");
  return config as Record<string, unknown>;
}
export async function storageLocation(override?: string) {
  let directory = override;
  let source = "argument";
  if (directory === undefined) {
    directory = process.env.SOYORI_STORAGE_DIR ?? process.env.AGENT_PLAN_STORAGE_DIR;
    source = "environment";
  }
  if (directory === undefined) {
    const config = await readConfig();
    if (
      config.storageDir !== undefined &&
      (typeof config.storageDir !== "string" || !isAbsolute(config.storageDir))
    )
      throw new Error("Invalid config.json: storageDir must be an absolute path.");
    directory = config.storageDir as string | undefined;
    source = "config";
  }
  if (directory === undefined) {
    directory = defaultDirectory();
    source = "default";
  }
  if (!directory.trim()) throw new Error("Storage directory must not be empty.");
  return { directory: resolve(directory), source, configFile: configPath() };
}
export async function setStorageDirectory(directory: string) {
  if (!directory.trim()) throw new Error("Storage directory must not be empty.");
  const config = await readConfig();
  config.storageDir = resolve(directory);
  await atomicWrite(configPath(), `${JSON.stringify(config, null, 2)}\n`);
  return { configFile: configPath(), storageDir: config.storageDir };
}
