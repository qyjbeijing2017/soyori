import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntime,
  fieldDefinitions,
  inspectFlow,
  parseFlow,
  withFieldDefinitions,
} from "../dist/index.js";

const grouped = () => ({
  schemaVersion: 1,
  name: "Groups",
  fields: [
    {
      type: "group",
      name: "Interface",
      description: "Shared fields",
      collapsed: true,
      fields: [
        { name: "input", input: true, initial: 1 },
        { type: "group", name: "Result", fields: [{ name: "result", output: true }] },
      ],
    },
  ],
  steps: [
    { type: "group", name: "Empty", steps: [] },
    {
      type: "group",
      name: "Work",
      collapsed: true,
      description: "Sequential",
      steps: [
        { type: "set", field: "$result", value: "$input" },
        {
          type: "group",
          name: "Nested",
          steps: [{ type: "add", left: "$result", right: 2, output: "$result" }],
        },
      ],
    },
  ],
});

test("inline groups retain metadata and execute transparently with real step paths", async () => {
  const flow = grouped();
  assert.deepEqual(parseFlow(JSON.parse(JSON.stringify(flow))), flow);
  const runtime = createRuntime(flow, { input: 8 });
  assert.equal(runtime.getState().nextStepPath, "steps[1].steps[0]");
  assert.equal((await runtime.step()).event.path, "steps[1].steps[0]");
  assert.equal((await runtime.step()).event.path, "steps[1].steps[1].steps[0]");
  assert.deepEqual(runtime.getState().output, { result: 10 });
  runtime.reset({ input: 4 });
  assert.equal(runtime.getState().nextStepPath, "steps[1].steps[0]");
  assert.deepEqual((await runtime.run()).output, { result: 6 });
  assert.equal(inspectFlow(flow).steps[1].name, "Work");
});

test("groups collect undeclared fields, enforce global uniqueness and validate metadata", () => {
  const flow = grouped();
  flow.steps[1].steps.push({ type: "set", field: "$extra", value: 1 });
  assert.equal(fieldDefinitions(parseFlow(flow).fields).extra.initial, undefined);
  flow.fields.push({ name: "input" });
  assert.throws(() => parseFlow(flow), /Duplicate field/);
  for (const modify of [
    (f) => {
      f.fields[0].collapsed = "yes";
    },
    (f) => {
      f.steps[0].collapsed = 1;
    },
    (f) => {
      f.fields[0].fields = {};
    },
    (f) => {
      f.steps[0].name = " ";
    },
    (f) => {
      f.fields[0].fields[0].unknown = true;
    },
  ]) {
    const invalid = grouped();
    modify(invalid);
    assert.throws(() => parseFlow(invalid), { code: "INVALID_FLOW" });
  }
});

test("calls inside groups validate grouped child interfaces and preserve reference identity", async () => {
  const child = {
    definition: {
      schemaVersion: 1,
      name: "Child",
      fields: [
        { type: "group", name: "IO", fields: [{ name: "value", input: true, output: true }] },
      ],
      steps: [],
    },
    imports: new Map(),
  };
  const definition = {
    schemaVersion: 1,
    name: "Parent",
    imports: { child: "child.yaml" },
    fields: { value: { input: true }, result: { output: true } },
    steps: [
      {
        type: "group",
        name: "Calls",
        steps: [
          {
            type: "call",
            target: "child",
            inputs: { value: "$value" },
            outputs: { value: "$result" },
          },
        ],
      },
    ],
  };
  const value = { nested: [] };
  const runtime = createRuntime({ definition, imports: new Map([["child", child]]) }, { value });
  assert.equal((await runtime.run()).output.result, value);
  definition.steps[0].steps[0].inputs = { missing: 1 };
  assert.throws(
    () => createRuntime({ definition, imports: new Map([["child", child]]) }),
    /not a child input/,
  );
  definition.steps[0].steps[0].target = "missing";
  assert.throws(() => createRuntime(definition), /Unknown call target|Import has not/);
});

test("empty groups terminate and groups within loops preserve normal execution", async () => {
  const flow = grouped();
  flow.steps = [{ type: "group", name: "Empty", steps: [] }];
  const empty = createRuntime(flow);
  assert.equal(empty.getState().nextStepPath, null);
  assert.equal((await empty.step()).event, null);
  assert.equal(empty.getState().status, "completed");
  flow.steps = [
    {
      type: "while",
      condition: "$input",
      body: [
        {
          type: "group",
          name: "Once",
          steps: [
            { type: "set", field: "$result", value: "$input" },
            { type: "set", field: "$input", value: false },
          ],
        },
      ],
    },
  ];
  assert.deepEqual((await createRuntime(flow).run()).output, { result: 1 });
});

test("flat updates retain grouped declarations and do not mutate source", () => {
  const flow = grouped();
  const definitions = fieldDefinitions(flow.fields);
  const fields = withFieldDefinitions(flow.fields, {
    ...definitions,
    input: { ...definitions.input, initial: 9 },
  });
  assert.equal(fields[0].collapsed, true);
  assert.equal(fields[0].fields[0].initial, 9);
  assert.equal(flow.fields[0].fields[0].initial, 1);
});
