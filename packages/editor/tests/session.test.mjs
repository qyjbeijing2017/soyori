import assert from "node:assert/strict";
import test from "node:test";
import { parseFlow } from "soyori-core";
import { createSession } from "../src/session.ts";
import { replaceStep } from "../src/step-model.ts";

test("failed nested step is attributed to its exact path and preserves previous effects", async () => {
  const flow = parseFlow({
    schemaVersion: 1,
    name: "failure",
    fields: {},
    steps: [
      {
        type: "if",
        condition: true,
        then: [
          { type: "set", field: "$value", value: 3 },
          { type: "divide", left: "$value", right: 0, output: "$value" },
        ],
      },
    ],
  });
  const session = createSession(flow, {});
  for (let i = 0; i < 3; i++) await session.step();
  assert.equal(session.runtime.getState().status, "failed");
  assert.equal(session.records.at(-1).path, "steps[0].then[1]");
  assert.equal(session.records.at(-1).error.code, "DIVISION_BY_ZERO");
  assert.equal(session.runtime.getState().fields.value, 3);
  const fixed = parseFlow({
    ...flow,
    steps: replaceStep(flow.steps, "steps[0].then[1]", {
      type: "divide",
      left: "$value",
      right: 3,
      output: "$value",
    }),
  });
  const rerun = createSession(fixed, {});
  for (let i = 0; i < 3; i++) await rerun.step();
  assert.equal(rerun.runtime.getState().status, "completed");
  assert.equal(rerun.runtime.getState().fields.value, 1);
});

test("object mutation does not alter earlier records and history remains bounded", async () => {
  const session = createSession(
    parseFlow({
      schemaVersion: 1,
      name: "loop",
      fields: {},
      steps: [
        { type: "set", field: "$object.n", value: 0 },
        {
          type: "while",
          condition: true,
          body: [{ type: "add", left: "$object.n", right: 1, output: "$object.n" }],
        },
      ],
    }),
    {},
  );
  await session.step();
  const record = session.records[0];
  for (let i = 0; i < 310; i++) await session.step();
  assert.match(record.after, /"n": 0/);
  assert.equal(session.records.length, 300);
  assert.equal(session.executed.has("steps[0]"), true);
  assert.equal(session.runtime.getState().fields.object.n, 155);
});
