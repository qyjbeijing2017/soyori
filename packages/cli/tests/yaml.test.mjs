import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFlow } from "../dist/flow-file.js";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args, "--json"], { cwd, encoding: "utf8", timeout: 10_000 });
function fixture(t, text, extension = ".yaml") {
  const directory = mkdtempSync(join(tmpdir(), "agent-yaml-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, `flow${extension}`);
  writeFileSync(path, text);
  return path;
}

test("JSON and YAML execute literal object templates, paths, append and dollar escapes", (t) => {
  const definition = {
    schemaVersion: 1,
    name: "Object operands",
    fields: { query: { initial: "hello" }, result: { initial: false, output: true } },
    steps: [
      { type: "set", field: "$result.options.limit", value: 10 },
      { type: "append", field: "$result.messages", value: { content: "$query", label: "$$tag" } },
      { type: "set", field: "$result.items[2]", value: true },
    ],
  };
  const yaml = `schemaVersion: 1
name: Object operands
fields:
  query: {initial: hello}
  result: {initial: false, output: true}
steps:
  - {type: set, field: $result.options.limit, value: 10}
  - type: append
    field: $result.messages
    value: {content: $query, label: $$tag}
  - {type: set, field: "$result.items[2]", value: true}
`;
  for (const [text, extension] of [
    [JSON.stringify(definition), ".json"],
    [yaml, ".yaml"],
  ]) {
    const result = run("run", fixture(t, text, extension));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).result, {
      result: {
        options: { limit: 10 },
        messages: [{ content: "hello", label: "$tag" }],
        items: [null, null, true],
      },
    });
  }
});

test("run, inspect and validate are identical for JSON and YAML flow definitions", () => {
  for (const command of ["run", "inspect", "validate"]) {
    const json = run(command, "examples/add-one.json");
    const yaml = run(command, "examples/add-one.yaml");
    assert.equal(json.status, 0, json.stderr);
    assert.equal(yaml.status, 0, yaml.stderr);
    const a = JSON.parse(yaml.stdout),
      b = JSON.parse(json.stdout);
    delete a.result.source;
    delete b.result.source;
    assert.deepEqual(a, b);
  }
});

test("root and subflow files can mix formats in either direction", (t) => {
  for (const [parent, child] of [
    ["yaml", "json"],
    ["json", "yaml"],
    ["yaml", "yaml"],
  ]) {
    const result = run(
      "run",
      fixture(
        t,
        parent === "json"
          ? JSON.stringify({
              schemaVersion: 1,
              name: "Parent",
              fields: { count: { input: true, output: true } },
              steps: [
                {
                  type: "call",
                  target: "child",
                  inputs: { count: "$count" },
                  outputs: { count: "$count" },
                },
              ],
            })
          : "schemaVersion: 1\nname: Parent\nfields: {count: {input: true, output: true}}\nsteps: [{type: call, target: child, inputs: {count: $count}, outputs: {count: $count}}]",
        `.${parent}`,
      ),
      "--flows",
      `child=${join(cwd, `examples/add-one.${child}`)}`,
      "--input-json",
      '{"count":4}',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).result, { count: 5 });
  }
});

test("YAML supports comments, multiline text, aliases and case-insensitive yml suffixes", async (t) => {
  const path = fixture(
    t,
    `# Hand-written flow
schemaVersion: 1
name: Readable
fields:
  first:
    initial: &message |
      hello
      agent
    output: true
  second:
    initial: *message
    output: true
  numericText:
    initial: "2"
    output: true
  yesText:
    initial: yes
    output: true
steps: []
`,
    ".YML",
  );
  const result = run("run", path);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, {
    first: "hello\nagent\n",
    second: "hello\nagent\n",
    numericText: "2",
    yesText: "yes",
  });
  assert.equal((await loadFlow(path)).name, "Readable");
});

test("YAML errors produce structured failures without silent tag or duplicate-key coercion", (t) => {
  for (const text of [
    "id: [broken",
    "id: first\nid: second",
    "id: one\n---\nid: two",
    "id: !custom test",
    "value: !!timestamp 2026-09-29",
    "? [a, b]\n: value",
    "%YAML 1.1\n---",
    '1: a\n"1": b',
  ]) {
    const result = run("validate", fixture(t, text));
    assert.equal(result.status, 1, result.stdout);
    assert.equal(JSON.parse(result.stdout).error.code, "INVALID_YAML");
    assert.equal(result.stderr, "");
  }
});

test("core rejects non-JSON YAML values, cycles and invalid flow structure", (t) => {
  for (const [initial, code] of [
    [".inf", "INVALID_VALUE"],
    ["&cycle [*cycle]", "INVALID_VALUE"],
  ]) {
    const path = fixture(
      t,
      `schemaVersion: 1\nname: Test\nfields:\n  value:\n    initial: ${initial}\nsteps: []\n`,
    );
    assert.equal(JSON.parse(run("validate", path).stdout).error.code, code);
  }
  assert.equal(
    JSON.parse(
      run("validate", fixture(t, "schemaVersion: 2\nname: Test\nfields: {}\nsteps: []")).stdout,
    ).error.code,
    "INVALID_FLOW",
  );
});

test("omitted YAML initial stays undefined and explicit null stays null", async (t) => {
  const path = fixture(
    t,
    "schemaVersion: 1\nname: Test\nfields:\n  omitted: {output: true}\n  explicit: {initial: null, output: true}\nsteps: []",
  );
  const flow = await loadFlow(path);
  assert.equal(Object.hasOwn(flow.fields.omitted, "initial"), false);
  assert.equal(flow.fields.explicit.initial, null);
  assert.equal(JSON.parse(run("run", path).stdout).error.code, "OUTPUT_NOT_JSON");
});

test("alias expansion limits fail before flow execution", (t) => {
  const repeated = "[*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]";
  const path = fixture(
    t,
    `a: &a [1]\nb: &b ${repeated}\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\n`,
  );
  const result = run("validate", path);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error.code, "INVALID_YAML");
});

test("JSON files stay strict JSON and extensionless JSON remains supported", (t) => {
  const invalid = run("validate", fixture(t, "id: yaml", ".json"));
  assert.equal(JSON.parse(invalid.stdout).error.code, "INVALID_JSON");
  const path = fixture(
    t,
    JSON.stringify({ schemaVersion: 1, name: "Test", fields: {}, steps: [] }),
    "",
  );
  assert.equal(run("validate", path).status, 0);
});
