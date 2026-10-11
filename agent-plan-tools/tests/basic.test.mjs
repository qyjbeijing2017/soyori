import assert from "node:assert/strict";
import test from "node:test";
import { BASIC_TOOL_DEFINITIONS, createBasicTools } from "../dist/index.js";

const tools = createBasicTools();
test("time.now uses the requested zone and returns consistent timestamps", () => {
  const start = Date.now(),
    utc = tools["time.now"]({ timeZone: "UTC" });
  assert.ok(utc.timestamp >= start && utc.timestamp <= Date.now());
  assert.equal(new Date(utc.timestamp).toISOString(), utc.iso);
  assert.equal(utc.date, utc.iso.slice(0, 10));
  assert.equal(utc.time, utc.iso.slice(11, 19));
  assert.ok(utc.weekday >= 1 && utc.weekday <= 7);
  const sh = tools["time.now"]({ timeZone: "Asia/Shanghai" });
  assert.equal(sh.timeZone, "Asia/Shanghai");
  const shifted = new Date(sh.timestamp + 8 * 3600000).toISOString();
  assert.equal(sh.date, shifted.slice(0, 10));
  assert.equal(sh.time, shifted.slice(11, 19));
  assert.throws(() => tools["time.now"]({ timeZone: "not-a-zone" }), /TIME_INPUT/);
});
test("math tools reject nonfinite numbers and handle signed rounding and ranges", () => {
  assert.equal(tools["math.abs"]({ value: -3 }).result, 3);
  assert.equal(tools["math.floor"]({ value: -1.2 }).result, -2);
  assert.equal(tools["math.ceil"]({ value: -1.2 }).result, -1);
  assert.equal(tools["math.round"]({ value: -1.5 }).result, -1);
  assert.equal(tools["math.min"]({ values: [3, -2, 4] }).result, -2);
  assert.equal(tools["math.max"]({ values: [3, -2, 4] }).result, 4);
  assert.equal(tools["math.clamp"]({ value: 9, min: 1, max: 4 }).result, 4);
  for (let i = 0; i < 100; i++) {
    const r = tools["math.random"]({ min: -2, max: 3 }).result;
    assert.ok(r >= -2 && r < 3);
  }
  assert.throws(() => tools["math.min"]({ values: [] }), /BASIC_INPUT/);
  assert.throws(() => tools["math.abs"]({ value: Infinity }), /BASIC_INPUT/);
  assert.throws(() => tools["math.abs"]({ value: "3" }), /BASIC_INPUT/);
  assert.throws(() => tools["math.clamp"]({ value: 2, min: 3, max: 1 }), /BASIC_INPUT/);
});
test("text and arrays follow literal JS semantics, preserve source and bound expansion", () => {
  assert.equal(tools["text.trim"]({ text: "  中 文 \n" }).result, "中 文");
  assert.deepEqual(tools["text.split"]({ text: "a..b..", separator: ".." }).result, ["a", "b", ""]);
  assert.equal(
    tools["text.replace"]({ text: "a.a", search: "a", replacement: "$&" }).result,
    "$&.$&",
  );
  assert.throws(
    () => tools["text.replace"]({ text: "a", search: "", replacement: "b" }),
    /BASIC_INPUT/,
  );
  assert.throws(
    () => tools["text.replace"]({ text: "aa", search: "a", replacement: "b".repeat(100000) }),
    /BASIC_LIMIT/,
  );
  const input = [[1], [2, [3]]],
    before = structuredClone(input);
  assert.deepEqual(tools["array.concat"]({ arrays: input }).result, [1, 2, [3]]);
  assert.deepEqual(input, before);
  assert.deepEqual(
    tools["array.slice"]({ array: [1, 2, 3, 4], start: -3, end: -1 }).result,
    [2, 3],
  );
  assert.equal(tools["array.length"]({ array: [] }).result, 0);
  assert.throws(() => tools["array.concat"]({ arrays: [[1], 2] }), /BASIC_INPUT/);
  assert.throws(() => tools["array.slice"]({ array: [], start: 0.5 }), /BASIC_INPUT/);
  for (const [name, definition] of Object.entries(BASIC_TOOL_DEFINITIONS))
    assert.equal(tools[name].definition, definition);
});
