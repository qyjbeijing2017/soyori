import assert from "node:assert/strict";
import test from "node:test";
import { inspectFlow, parseFlow, toJsonValue } from "../dist/index.js";

test("public parsing and inspection share implicit-field validation", () => {
  const source = {
    schemaVersion: 1,

    name: "Example",
    fields: {},
    steps: [
      {
        type: "if",
        condition: "$ready",
        then: [{ type: "call", target: "http", output: "$response" }],
      },
    ],
  };
  assert.deepEqual(Object.keys(parseFlow(source).fields), ["ready", "response"]);
  assert.deepEqual(source.fields, {});
  assert.deepEqual(inspectFlow(source).references, [{ target: "http", path: "steps[0].then[0]" }]);
  assert.throws(() => parseFlow({ ...source, schemaVersion: 2 }), { code: "INVALID_FLOW" });
});

test("JSON encoder copies data and rejects lossy shapes without calling hooks", () => {
  const value = { a: [null, true, 2, "text"], b: { x: 1 } };
  const copy = toJsonValue(value);
  assert.deepEqual(copy, value);
  assert.notEqual(copy.b, value.b);
  let calls = 0;
  const getter = Object.defineProperty({}, "x", {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  const hook = Object.defineProperty({ x: 1 }, "toJSON", {
    value() {
      calls++;
      return "changed";
    },
  });
  const array = [1];
  array.extra = "lost";
  const cycle = {};
  cycle.self = cycle;
  const symbolArray = [1];
  symbolArray[Symbol("hidden")] = 1;
  for (const item of [
    getter,
    hook,
    array,
    cycle,
    symbolArray,
    [, 1],
    undefined,
    NaN,
    Infinity,
    1n,
    new Uint8Array(1),
    new Date(),
  ]) {
    assert.throws(() => toJsonValue(item), { code: "INVALID_VALUE" });
  }
  assert.equal(calls, 0);
});
