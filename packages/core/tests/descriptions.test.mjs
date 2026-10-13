import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime, inspectFlow, parseFlow } from "../dist/index.js";

const flow = (steps = []) => ({
  schemaVersion: 1,

  name: "Described",
  description: "用途\n第二行",
  fields: {
    count: { initial: 2, input: true, output: true, description: "输入原值，输出结果" },
    one: { initial: 1, description: "内部增量" },
  },
  steps,
});

test("descriptions survive inspection and step events without changing execution", async () => {
  const source = flow([
    {
      type: "if",
      condition: "$one",
      description: "判断是否执行",
      then: [{ type: "add", left: "$count", right: "$one", output: "$count", description: "加一" }],
    },
  ]);
  const info = inspectFlow(source);
  assert.equal(info.description, source.description);
  assert.equal(info.fields.count.description, "输入原值，输出结果");
  assert.deepEqual(info.steps, [
    { type: "if", path: "steps[0]", description: "判断是否执行" },
    { type: "add", path: "steps[0].then[0]", description: "加一" },
  ]);
  const runtime = createRuntime(source);
  assert.equal((await runtime.step()).event.description, "判断是否执行");
  assert.equal((await runtime.step()).event.description, "加一");
  assert.deepEqual(runtime.getState().output, { count: 3 });
  const plain = flow([]);
  delete plain.description;
  assert.equal(Object.hasOwn(inspectFlow(plain), "description"), false);
});

test("every step kind accepts documentation and rejects non-string descriptions", () => {
  const steps = [
    ...[
      "add",
      "subtract",
      "multiply",
      "divide",
      "equal",
      "notEqual",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ].map((type) => ({ type, left: "$count", right: "$one", output: "$count" })),
    { type: "template", template: "$one$", output: "$count" },
    ...["and", "or"].map((type) => ({ type, inputs: ["$one"], output: "$count" })),
    { type: "set", field: "$count", value: "$one" },
    { type: "append", field: "$count", value: 1 },
    { type: "not", input: "$one", output: "$count" },
    { type: "if", condition: "$one", then: [] },
    { type: "while", condition: "$one", body: [] },
    { type: "call", target: "example" },
    { type: "call", target: "child" },
  ];
  for (const step of steps) {
    assert.equal(parseFlow(flow([{ ...step, description: "" }])).steps[0].description, "");
    assert.throws(() => parseFlow(flow([{ ...step, description: 1 }])), {
      code: "INVALID_FLOW",
      path: "steps[0].description",
    });
  }
  for (const description of [null, false, 2, [], {}]) {
    assert.throws(() => parseFlow({ ...flow(), description }), {
      code: "INVALID_FLOW",
      path: "flow.description",
    });
    assert.throws(() => parseFlow({ ...flow(), fields: { count: { description } } }), {
      code: "INVALID_FLOW",
      path: "fields.count.description",
    });
  }
  assert.throws(
    () =>
      parseFlow(
        flow([
          {
            type: "while",
            condition: "$one",
            body: [{ type: "set", field: "$count", value: "$one", description: null }],
          },
        ]),
      ),
    { path: "steps[0].body[0].description" },
  );
});
