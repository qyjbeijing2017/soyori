import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("CLI storage configuration, flow tools and management share the same documents", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agent-storage-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    APPDATA: root,
    LOCALAPPDATA: root,
    XDG_CONFIG_HOME: root,
    XDG_DATA_HOME: root,
  };
  delete env.SOYORI_STORAGE_DIR;
  delete env.AGENT_PLAN_STORAGE_DIR;
  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const run = (args, overrides = {}) => {
    const p = spawnSync(process.execPath, [cli, ...args, "--json"], {
      cwd: root,
      env: { ...env, ...overrides },
      encoding: "utf8",
    });
    assert.equal(p.status, 0, p.stdout + p.stderr);
    return JSON.parse(p.stdout).result;
  };
  assert.equal(run(["storage", "info"]).source, "default");
  run(["config", "set", "storage-dir", "saved"]);
  assert.equal(run(["storage", "info"]).directory, join(root, "saved"));
  assert.equal(run(["storage", "info"]).source, "config");
  assert.equal(
    run(["storage", "info"], { SOYORI_STORAGE_DIR: "environment" }).directory,
    join(root, "environment"),
  );
  assert.equal(
    run(["storage", "info"], { AGENT_PLAN_STORAGE_DIR: "legacy" }).directory,
    join(root, "legacy"),
  );
  assert.equal(
    run(["storage", "info"], {
      SOYORI_STORAGE_DIR: "environment",
      AGENT_PLAN_STORAGE_DIR: "legacy",
    }).directory,
    join(root, "environment"),
  );
  assert.equal(
    run(["storage", "info", "--storage-dir", "argument"], { SOYORI_STORAGE_DIR: "environment" })
      .source,
    "argument",
  );
  const flow = join(root, "storage.json");
  await writeFile(
    flow,
    JSON.stringify({
      schemaVersion: 1,
      name: "storage",
      fields: { count: { output: true } },
      steps: [
        {
          type: "call",
          target: "storage.write",
          inputs: { key: "assistant/memory", value: { messages: ["hello"] } },
        },
        {
          type: "call",
          target: "tokens.count",
          inputs: { input: "你好", mode: "estimate" },
          outputs: { tokens: "$count" },
        },
      ],
    }),
  );
  assert.equal(run(["run", flow]).count, 6);
  assert.deepEqual(run(["storage", "get", "assistant/memory"]), {
    found: true,
    value: { messages: ["hello"] },
  });
  assert.deepEqual(run(["storage", "list", "assistant/"]), { keys: ["assistant/memory"] });
  assert.deepEqual(run(["storage", "delete", "assistant/memory"]), { deleted: true });
  assert.deepEqual(run(["storage", "get", "assistant/memory"]), { found: false, value: null });
  const bad = spawnSync(process.execPath, [cli, "storage", "get", "../escape", "--json"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
});
