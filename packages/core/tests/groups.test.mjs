import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntime,
  fieldDefinitions,
  fieldEntries,
  inspectFlow,
  keyedFields,
  parseFlow,
  withFieldDefinitions,
  withoutSensitiveInitials,
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
      f.fields[0].fields = 1;
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

const keyed = () => ({
  schemaVersion: 1,
  name: "Keyed groups",
  fields: {
    inputs: {
      type: "group",
      name: "输入",
      collapsed: true,
      description: "Keep this label",
      fields: {
        count: { input: true, initial: 2 },
        nested: { type: "group", fields: { answer: { output: true } } },
        secret: { sensitive: true, initial: "key" },
      },
    },
  },
  steps: [{ type: "add", left: "$count", right: 1, output: "$answer" }],
});

test("keyed groups run in a flat scope and preserve stable keys through display edits", async () => {
  const source = keyed();
  assert.deepEqual(parseFlow(source), source);
  const state = await createRuntime(source, { count: 8 }).run();
  assert.deepEqual(state.output, { answer: 9 });
  const entries = fieldEntries(source.fields);
  assert.equal(entries[0].key, "inputs");
  assert.equal(entries[0].fields[1].name, "nested");
  entries[0].name = "重命名";
  const fields = keyedFields(entries);
  assert.deepEqual(Object.keys(fields), ["inputs"]);
  assert.equal(fields.inputs.name, "重命名");
  assert.equal(source.fields.inputs.name, "输入");
  const updated = withFieldDefinitions(source.fields, {
    ...fieldDefinitions(source.fields),
    count: { initial: 6, input: true },
  });
  assert.equal(updated.inputs.fields.count.initial, 6);
  assert.equal(updated.inputs.collapsed, true);
  const exported = withoutSensitiveInitials(source);
  assert.equal(exported.fields.inputs.fields.secret.initial, undefined);
  assert.equal(source.fields.inputs.fields.secret.initial, "key");
});

test("keyed groups reject invalid metadata, duplicate fields and implicit root collisions", () => {
  for (const change of [
    (flow) => {
      flow.fields.inputs.name = null;
    },
    (flow) => {
      flow.fields.inputs.fields = [];
      flow.fields.count = { initial: 0 };
      flow.fields.other = { type: "group", fields: { count: {} } };
    },
    (flow) => {
      flow.fields.inputs.type = "folder";
    },
    (flow) => {
      flow.fields.inputs.fields = "invalid";
    },
    (flow) => {
      flow.steps[0].output = "$inputs";
    },
  ]) {
    const flow = keyed();
    change(flow);
    assert.throws(() => parseFlow(flow), { code: "INVALID_FLOW" });
  }
  const flow = keyed();
  flow.steps[0].output = "$extra";
  assert.deepEqual(parseFlow(flow).fields.extra, {});
  assert.throws(
    () =>
      keyedFields([
        { type: "group", key: "answer", name: "Group", fields: [] },
        { name: "answer" },
      ]),
    /Duplicate field or group key/,
  );
});

test("legacy list declarations convert without losing duplicate group labels or field data", () => {
  const fields = [
    { name: "Group", initial: { literal: "$unchanged" } },
    { type: "group", name: "Group", fields: [{ name: "a", input: true }] },
    { type: "group", name: "Group", fields: [{ name: "b", output: true }] },
  ];
  const mapped = keyedFields(fields);
  assert.deepEqual(Object.keys(mapped), ["Group", "Group_2", "Group_3"]);
  assert.deepEqual(fieldDefinitions(mapped), fieldDefinitions(fields));
  assert.deepEqual(keyedFields(fieldEntries(mapped)), mapped);
});
