import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./deploy-editor.mjs", import.meta.url);
let sequence = 0;
async function fixture(run, options = {}) {
  const original = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "soyori-deploy-"));
  const dist = join(directory, "packages/editor/dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  const asset = options.unhashed ? "entry.js" : "entry-1234abcd.js";
  writeFileSync(join(dist, "assets", asset), "export {}");
  if (!options.missingIndex) {
    writeFileSync(join(dist, "index.html"), '<script src="/assets/entry-1234abcd.js"></script>');
  }
  const calls = [];
  const mock = test.mock.method(childProcess, "spawnSync", (command, args) => {
    calls.push([command, ...args]);
    return {
      status: options.failAt === calls.length ? 1 : 0,
      stdout: args[0] === "cloudfront" && args[1] === "create-invalidation" ? "I123\n" : "",
      stderr: "simulated failure",
    };
  });
  syncBuiltinESMExports();
  process.chdir(directory);
  try {
    await run(() => import(`${script.href}?test=${sequence++}`), calls);
  } finally {
    process.chdir(original);
    mock.mock.restore();
    syncBuiltinESMExports();
    rmSync(directory, { recursive: true, force: true });
  }
}
test("uploads hashed assets, mutable files and index in order, then waits for invalidation", async () => {
  await fixture(async (run, calls) => {
    await run();
    assert.equal(calls.length, 5);
    assert.equal(calls[0][3], "packages/editor/dist/assets/");
    assert.ok(calls[0].includes("public,max-age=31536000,immutable"));
    assert.ok(calls[1].includes("--exclude"));
    assert.equal(calls[2][3], "packages/editor/dist/index.html");
    assert.ok(calls[2].includes("no-cache,no-store,must-revalidate"));
    assert.equal(calls[3][2], "create-invalidation");
    assert.ok(calls[3].includes("EX63P0WN21EXX"));
    assert.equal(calls[4].at(-1), "I123");
    assert.ok(calls.every((call) => !call.includes("--delete") && !call.includes("--acl")));
  });
});
test("an asset upload failure prevents index publication and invalidation", async () => {
  await fixture(
    async (run, calls) => {
      await assert.rejects(run, /simulated failure/);
      assert.equal(calls.length, 1);
    },
    { failAt: 1 },
  );
});
test("an index upload failure prevents invalidation", async () => {
  await fixture(
    async (run, calls) => {
      await assert.rejects(run, /simulated failure/);
      assert.equal(calls.length, 3);
    },
    { failAt: 3 },
  );
});
test("rejects an incomplete build before calling AWS", async () => {
  await fixture(
    async (run, calls) => {
      await assert.rejects(run, /Missing dist\/index.html/);
      assert.equal(calls.length, 0);
    },
    { missingIndex: true },
  );
});
test("rejects unhashed files before assigning immutable cache headers", async () => {
  await fixture(
    async (run, calls) => {
      await assert.rejects(run, /unhashed asset/);
      assert.equal(calls.length, 0);
    },
    { unhashed: true },
  );
});
