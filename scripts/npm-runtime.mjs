import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const packages = ["core", "storage", "script", "tools", "ai", "cli"];

export function npmCli() {
  const candidates = [
    process.env.SOYORI_NPM_CLI,
    process.env.AGENT_PLAN_NPM_CLI,
    resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
    "/usr/share/nodejs/npm/bin/npm-cli.js",
  ];
  const path = candidates.find((path) => path && existsSync(path));
  if (!path) throw Error("Set SOYORI_NPM_CLI to your npm/bin/npm-cli.js path.");
  return path;
}

export function runNode(args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else reject(Error(`Command failed (${code}): ${stderr || stdout}`));
    });
  });
}
