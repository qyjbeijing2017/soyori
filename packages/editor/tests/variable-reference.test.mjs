import assert from "node:assert/strict";
import test from "node:test";
import { parseFlow } from "soyori-core";
import { fieldReference, normalizeReference, variableQuery } from "../src/variable-reference.ts";

test("output names normalize through Core and reject unsafe or malformed paths", () => {
  for (const [input, expected] of [
    ["count", "$count"],
    [" $count ", "$count"],
    ["data.items[0]", "$data.items[0]"],
    ["", ""],
    ["a b", null],
    ["$", null],
    ["$$count", null],
    ["data.__proto__", null],
    ["items[-1]", null],
  ])
    assert.equal(normalizeReference(input), expected);
  for (const name of ["count", "中文", "a.b", "space name", "a-b"]) {
    const flow = parseFlow({
      schemaVersion: 1,
      name: "test",
      fields: {},
      steps: [{ type: "set", field: fieldReference(name), value: 1 }],
    });
    assert.deepEqual(Object.keys(flow.fields), [name]);
  }
});

test("suggestions accept short names but leave text, structured data and literals alone", () => {
  for (const source of ["cou", "$cou", "", "$", "中文"])
    assert.notEqual(variableQuery(source), null);
  for (const source of [
    "a\nb",
    "a".repeat(49),
    "hello world",
    '{"a":1}',
    "a: 1",
    "[1,2]",
    "123",
    "true",
    "$$count",
  ])
    assert.equal(variableQuery(source), null);
});
