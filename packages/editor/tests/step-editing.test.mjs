import assert from "node:assert/strict";
import test from "node:test";
import { parseFlow } from "soyori-core";
import { removeStep, replaceStep } from "../src/step-model.ts";

test("editing and deleting nested steps preserves sibling branches and source flow", () => {
  const flow = parseFlow({
    schemaVersion: 1,
    name: "nested",
    fields: { value: {} },
    steps: [
      {
        type: "if",
        condition: true,
        then: [
          { type: "set", field: "$value", value: 1 },
          { type: "while", condition: false, body: [{ type: "set", field: "$value", value: 2 }] },
        ],
        else: [{ type: "set", field: "$value", value: 3 }],
      },
    ],
  });
  const before = structuredClone(flow);
  const edited = replaceStep(flow.steps, "steps[0].then[1].body[0]", {
    type: "set",
    field: "$value",
    value: 4,
  });
  assert.equal(edited[0].then[1].body[0].value, 4);
  const removed = removeStep(edited, "steps[0].then[1].body[0]");
  assert.deepEqual(removed[0].then[1].body, []);
  assert.equal(removed[0].else[0].value, 3);
  assert.equal(removed[0].then[0].value, 1);
  assert.deepEqual(flow, before);
  assert.deepEqual(removeStep(flow.steps, "steps[0]"), []);
  parseFlow({ ...flow, steps: removed });
});

test("step summaries use assignment and operator notation without changing core semantics", async () => {
  const { stepSummary } = await import("../src/step-model.ts");
  assert.equal(
    stepSummary({ type: "add", left: "$count", right: 1, output: "$count" }),
    "$count = $count + 1",
  );
  assert.equal(
    stepSummary({ type: "subtract", left: "$count", right: 1, output: "$count" }),
    "$count = $count - 1",
  );
  assert.equal(
    stepSummary({ type: "set", field: "$text", value: "$$literal" }),
    '$text = "$literal"',
  );
  assert.equal(
    stepSummary({ type: "append", field: "$items", value: { text: "$text" } }),
    "$items.push({ text: $text })",
  );
  assert.equal(stepSummary({ type: "if", condition: "$ready", then: [] }), "if ($ready)");
  assert.equal(
    stepSummary({ type: "equal", left: "$a", right: "$b", output: "$same" }),
    "$same = equal($a, $b)",
  );
  assert.equal(
    stepSummary({
      type: "call",
      target: "storage.read",
      inputs: { key: "$key" },
      output: "$memory",
    }),
    "$memory = storage.read({ key: $key })",
  );
});
