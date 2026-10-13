import assert from "node:assert/strict";
import test from "node:test";
import { readFlowFile } from "../src/flow-files.ts";

test("Library imports JSON and YAML through the core validator without changing references", () => {
  const json = {
    schemaVersion: 1,
    name: "测试",
    fields: { prompt: { input: true, initial: "你好" }, answer: { output: true } },
    steps: [{ type: "set", field: "$answer", value: "$prompt" }],
  };
  const yaml =
    "schemaVersion: 1\nname: 测试\nfields:\n  prompt: {input: true, initial: 你好}\n  answer: {output: true}\nsteps:\n  - type: set\n    field: $answer\n    value: $prompt\n";
  assert.deepEqual(
    readFlowFile(yaml, "FLOW.YAML"),
    readFlowFile(`\uFEFF${JSON.stringify(json)}`, "test.json"),
  );
  const exported = JSON.stringify(readFlowFile(yaml, "a.yml"));
  assert.deepEqual(readFlowFile(exported, "renamed.json"), readFlowFile(yaml, "a.yml"));
});
test("Library refuses malformed, oversized or unsupported files before persistence", () => {
  assert.throws(() => readFlowFile("{", "broken.json"));
  assert.throws(() => readFlowFile('{"name":"missing protocol"}', "broken.json"));
  assert.throws(() => readFlowFile("name: a\nname: b", "duplicate.yml"));
  assert.throws(() => readFlowFile("{}", "unknown.txt"), /仅支持/);
  assert.throws(() => readFlowFile(" ".repeat(5 * 1024 * 1024 + 1), "large.json"), /5 MB/);
});
