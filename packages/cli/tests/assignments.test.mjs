import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args, "--json"], { cwd, encoding: "utf8", timeout: 10_000 });
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "agent-assign-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const flow = join(directory, "flow.json");
  writeFileSync(
    flow,
    JSON.stringify({
      schemaVersion: 1,

      name: "Inputs",
      fields: Object.fromEntries(
        ["value", "__proto__", "user.name"].map((key) => [
          key,
          { initial: null, input: true, output: true },
        ]),
      ),
      steps: [],
    }),
  );
  return { flow, directory };
}

test("set parses scalars and preserves plain text, empty values and equals signs", (t) => {
  const { flow } = fixture(t);
  for (const [text, expected] of [
    ["2", 2],
    ["-3.5", -3.5],
    ["2e2", 200],
    ["true", true],
    ["false", false],
    ["null", null],
    ["你好 世界", "你好 世界"],
    ["", ""],
    ["a=b", "a=b"],
    ["001", "001"],
    ["[1,2]", "[1,2]"],
  ]) {
    const result = run("run", flow, "--set", `value=${text}`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).result.value, expected);
  }
});

test("set and set-string honor command order and override base input", (t) => {
  const { flow, directory } = fixture(t);
  const input = join(directory, "input.json");
  writeFileSync(input, '{"value":1,"user.name":"preserved"}');
  const result = run(
    "run",
    flow,
    "--set",
    "value=2",
    "--input",
    input,
    "--set-string",
    "value=false",
    "--set",
    "__proto__=safe",
  );
  assert.equal(result.status, 0, result.stderr);
  const values = JSON.parse(result.stdout).result;
  assert.equal(values.value, "false");
  assert.equal(values["user.name"], "preserved");
  assert.equal(Object.getOwnPropertyDescriptor(values, "__proto__").value, "safe");
  const reversed = run("run", flow, "--set-string", "value=2", "--set", "value=false");
  assert.equal(JSON.parse(reversed.stdout).result.value, false);
  assert.equal(run("validate", flow, "--set", "value=2").status, 0);
});

test("malformed assignments and numeric overflow give machine errors", () => {
  for (const value of [
    "missing-separator",
    "=empty-name",
    "count=1e999",
    "count=9007199254740993",
  ]) {
    const result = run("run", "examples/add-one.yaml", "--set", value);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).error.code, "INVALID_ARGUMENT");
  }
});

test("inspect and trace expose descriptions from distributed YAML", (t) => {
  const { directory } = fixture(t);
  const inspection = run("inspect", "examples/add-one.yaml");
  const info = JSON.parse(inspection.stdout).result;
  assert.equal(info.description, "接收一个数字，加一后返回。");
  assert.equal(info.fields.count.description, "输入待处理数字，输出计算结果。");
  assert.equal(info.steps[0].description, "将 count 增加 increment。");
  const trace = join(directory, "trace.jsonl");
  assert.equal(run("run", "examples/add-one.yaml", "--set", "count=2", "--trace", trace).status, 0);
  const event = readFileSync(trace, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .find((item) => item.type === "step-end");
  assert.equal(event.event.description, info.steps[0].description);
});

test("Windows PowerShell passes set arguments without JSON quoting", {
  skip: process.platform !== "win32",
}, () => {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "node packages/cli/dist/index.js run examples/add-one.yaml --set count=2 --json",
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, { count: 3 });
});
