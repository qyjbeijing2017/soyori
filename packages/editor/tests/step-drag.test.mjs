import assert from "node:assert/strict";
import test from "node:test";
import { moveStepEntry } from "../src/step-drag.ts";

test("drag steps into groups and branches without losing siblings or changing source", () => {
  const a = { type: "set", target: "$a", value: 1 };
  const b = { type: "set", target: "$b", value: 2 };
  const group = { type: "group", name: "G", steps: [b] };
  const original = [a, group];
  const moved = moveStepEntry(original, [0], [1, "steps"], 1);
  assert.deepEqual(moved, [{ ...group, steps: [b, a] }]);
  assert.deepEqual(original, [a, group]);
  assert.deepEqual(moveStepEntry(moved, [0, "steps", 1], [], 0), original);
  assert.deepEqual(moveStepEntry(original, [1], [1, "steps"], 0), original);
  assert.deepEqual(moveStepEntry(original, [0], [8, "steps"], 0), original);
  const branch = { type: "if", condition: true, then: [a] };
  assert.deepEqual(moveStepEntry([branch], [0, "then", 0], [0, "else"], 0), [
    { ...branch, then: [], else: [a] },
  ]);
  const loop = { type: "while", condition: false, body: [] };
  assert.deepEqual(moveStepEntry([a, loop], [0], [1, "body"], 0), [{ ...loop, body: [a] }]);
  assert.deepEqual(moveStepEntry([a, b], [0], [], 2), [b, a]);
});

test("drag rejects a container into a descendant", () => {
  const tree = [
    { type: "group", name: "outer", steps: [{ type: "group", name: "inner", steps: [] }] },
  ];
  assert.deepEqual(moveStepEntry(tree, [0], [0, "steps", 0, "steps"], 0), tree);
});
