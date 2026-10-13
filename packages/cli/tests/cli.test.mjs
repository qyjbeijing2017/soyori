import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const cwd = fileURLToPath(new URL("../", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });

test("help explains supported commands", () => {
  const result = run("--help");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /run \[options\]/);
});

test("runs a core flow with JSON inputs", () => {
  const result = run("run", "examples/add-one.json", "--input", "examples/input.json", "--json");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { version: 1, ok: true, result: { count: 3 } });
});

test("loads a relative subflow import", () => {
  const result = run("run", "examples/parent.json", "--input", "examples/input.json", "--json");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, { count: 3 });
});

test("loads a host function module", () => {
  const result = run(
    "run",
    "examples/function.json",
    "--functions",
    "examples/functions.mjs",
    "--json",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, { message: "Hello, Agent!" });
});

test("unknown commands and missing dependencies fail without success output", () => {
  for (const args of [["debug"], ["run", "missing.json"], ["run", "examples/function.json"]]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /soyori:/);
  }
});

test("non-JSON output is inspectable but never silently serialized as JSON", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "agent-plan-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const definition = join(directory, "flow.json");
  writeFileSync(
    definition,
    JSON.stringify({
      schemaVersion: 1,

      name: "Empty",
      fields: { value: { output: true } },
      steps: [],
    }),
  );
  const normal = run("run", definition);
  assert.equal(normal.status, 0, normal.stderr);
  assert.match(normal.stdout, /undefined/);
  const json = run("run", definition, "--json");
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stdout).error.code, "OUTPUT_NOT_JSON");
  assert.equal(json.stderr, "");
});

test("execution failures propagate a nonzero exit code and step location", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "agent-plan-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const definition = join(directory, "flow.json");
  writeFileSync(
    definition,
    JSON.stringify({
      schemaVersion: 1,

      name: "Divide",
      fields: { zero: { initial: 0 } },
      steps: [{ type: "divide", left: "$zero", right: "$zero", output: "$result" }],
    }),
  );
  const result = run("run", definition);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIVISION_BY_ZERO.*flow.json:steps\[0\]/);
});
