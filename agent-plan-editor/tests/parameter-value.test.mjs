import assert from "node:assert/strict";
import test from "node:test";
import { formatValue, inferValue } from "../src/parameter-value.ts";
import { createSession } from "../src/session.ts";

test("parameter inference supports scalars, JSON/YAML and exact plain text", () => {
  for (const [source, expected] of [
    ["12.5", 12.5],
    ["-2", -2],
    ["false", false],
    ["null", null],
    ['"123"', "123"],
    ["$request.text", "$request.text"],
    ["$$literal", "$$literal"],
    ['{"limit":2,"enabled":true}', { limit: 2, enabled: true }],
    ["limit: 2\nenabled: true", { limit: 2, enabled: true }],
    ["- a\n- b", ["a", "b"]],
    ["你好\n  保留换行", "你好\n  保留换行"],
  ])
    assert.deepEqual(inferValue(source), expected);
  assert.equal(inferValue("", true), undefined);
  assert.equal(inferValue('""', true), "");
  assert.equal(inferValue(""), "");
});
test("formatting preserves ambiguous strings, types and rejects malformed data", () => {
  for (const value of [
    "",
    "123",
    "false",
    "null",
    "{",
    "a: b",
    "# 注释",
    "你好\n世界",
    "$x",
    "$$x",
    0,
    null,
    true,
    [1, "2"],
    { text: "true", count: 3 },
  ]) {
    assert.deepEqual(inferValue(formatValue(value)), value);
  }
  for (const value of ["{bad", "[1,", "a: 1\na: 2", ".inf", "!unknown value"])
    assert.throws(() => inferValue(value));
});
test("paused variable edits continue at the next step without changing definitions or history", async () => {
  const flow = {
    schemaVersion: 1,
    name: "debug",
    fields: { count: { initial: 1 }, result: { output: true } },
    steps: [
      { type: "add", left: "$count", right: 1, output: "$count" },
      { type: "multiply", left: "$count", right: 3, output: "$result" },
    ],
  };
  const session = createSession(flow, {});
  session.runtime.setFields({ count: inferValue("4") });
  await session.step();
  const record = session.records[0].after;
  assert.equal(session.runtime.getState().fields.count, 5);
  const next = session.runtime.getState().nextStepPath;
  session.runtime.setFields({ count: inferValue("10") });
  assert.equal(session.runtime.getState().nextStepPath, next);
  await session.step();
  assert.equal(session.runtime.getState().output.result, 30);
  assert.equal(flow.fields.count.initial, 1);
  assert.equal(session.records[0].after, record);
});
