import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRuntime, RuntimeError } from "../dist/index.js";

// Literals are now first-class operands; escape $ when testing literal strings.
const constant = (value) =>
  typeof value === "string" && value.startsWith("$") ? `$${value}` : value;
const field = (name) => `$${name}`;
const flow = (steps = [], fields = { result: { output: true } }) => ({
  schemaVersion: 1,
  name: "Test",
  fields,
  steps,
});
const hasCode = (code) => (error) => error instanceof RuntimeError && error.code === code;

function counterFlow() {
  const compare = {
    type: "lessThan",
    left: field("count"),
    right: field("target"),
    output: "$continue",
  };
  return flow(
    [
      compare,
      {
        type: "while",
        condition: "$continue",
        body: [
          { type: "add", left: field("count"), right: constant(1), output: "$count" },
          compare,
        ],
      },
      { type: "template", template: "count=$count$", output: "$message" },
    ],
    {
      count: { initial: 0, input: true, output: true },
      target: { initial: 3, input: true },
      continue: {},
      message: { output: true },
    },
  );
}

test("step exposes loop checks and individual body nodes; run resumes", async () => {
  const runtime = createRuntime(counterFlow());
  const state = runtime.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.fields.continue, undefined);
  const first = await runtime.step();
  assert.equal(first.event.path, "steps[0]");
  assert.strictEqual(first.state, state);
  assert.equal(state.nextStepPath, "steps[1]");
  const loop = await runtime.step();
  assert.deepEqual(loop.event, {
    invocationId: runtime.invocationId,
    flowName: runtime.flowName,
    path: "steps[1]",
    type: "while",
    condition: true,
    branch: "body",
  });
  assert.equal(state.fields.count, 0);
  await runtime.step();
  assert.equal(state.fields.count, 1);
  assert.equal(state.nextStepPath, "steps[1].body[1]");
  runtime.setFields({ count: 2 });
  const final = await runtime.run();
  assert.strictEqual(final, state);
  assert.equal(state.status, "completed");
  assert.equal(state.busy, false);
  assert.deepEqual(state.output, { count: 3, message: "count=3" });
  assert.equal((await runtime.step()).event, null);
  assert.strictEqual(await runtime.run(), final);
  assert.throws(() => runtime.setFields({ count: 4 }), hasCode("RUNTIME_FINISHED"));
});

test("single-step execution and run produce the same outputs", async () => {
  const stepped = createRuntime(counterFlow());
  const paths = [];
  while (stepped.getState().status !== "completed") paths.push((await stepped.step()).event.path);
  assert.equal(paths.filter((path) => path === "steps[1]").length, 4);
  assert.deepEqual(stepped.getState().output, (await createRuntime(counterFlow()).run()).output);
});

test("if selects only one branch, empty branches advance, truthiness needs no conversion", async () => {
  for (const [condition, truthy] of [
    [false, false],
    [null, false],
    [0, false],
    ["", false],
    [[], true],
    [{}, true],
    ["0", true],
  ]) {
    const runtime = createRuntime(
      flow(
        [
          {
            type: "if",
            condition: "$condition",
            then: [{ type: "set", field: "$result", value: constant("yes") }],
            else: [],
          },
        ],
        { condition: { initial: condition }, result: { initial: "no", output: true } },
      ),
    );
    const result = await runtime.step();
    assert.equal(result.event.condition, truthy);
    if (truthy) {
      assert.equal(result.state.fields.result, "no");
      assert.equal(result.state.nextStepPath, "steps[0].then[0]");
    }
    assert.equal((await runtime.run()).output.result, truthy ? "yes" : "no");
  }
});

test("nested loops get a fresh inner counter each time they are entered", async () => {
  const runtime = createRuntime(
    flow(
      [
        {
          type: "while",
          condition: "$outer",
          body: [
            { type: "set", field: "$inner", value: constant(2) },
            {
              type: "while",
              condition: "$inner",
              body: [
                { type: "subtract", left: field("inner"), right: constant(1), output: "$inner" },
                { type: "add", left: field("result"), right: constant(1), output: "$result" },
              ],
            },
            { type: "subtract", left: field("outer"), right: constant(1), output: "$outer" },
          ],
        },
      ],
      { outer: { initial: 2 }, inner: {}, result: { initial: 0, output: true } },
    ),
    {},
    { maxIterations: 2 },
  );
  assert.deepEqual((await runtime.run()).output, { result: 4 });
});

test("loop limit persists across steps and field edits; reset clears it", async () => {
  const runtime = createRuntime(
    flow([{ type: "while", condition: "$again", body: [] }], {
      again: { initial: true },
    }),
    {},
    { maxIterations: 2 },
  );
  await runtime.step();
  runtime.setFields({ again: true });
  await runtime.step();
  const failed = await runtime.step();
  assert.equal(failed.state.status, "failed");
  assert.equal(failed.event.error.code, "LOOP_LIMIT");
  assert.equal(failed.state.error.path, "steps[0]");
  assert.equal(failed.state.error.field, "$again");
  assert.equal((await runtime.step()).event, null);
  runtime.reset();
  await runtime.step();
  runtime.setFields({ again: false });
  assert.equal((await runtime.run()).status, "completed");
});

test("default limit protects an empty infinite loop", async () => {
  const runtime = createRuntime(
    flow([{ type: "while", condition: "$again", body: [] }], { again: { initial: true } }),
  );
  assert.equal((await runtime.run()).error.code, "LOOP_LIMIT");
});

test("busy calls reject without failing the original call", async () => {
  for (const method of ["step", "run"]) {
    const runtime = createRuntime(counterFlow());
    const pending = runtime[method]();
    assert.equal(runtime.getState().busy, true);
    const extraStep = assert.rejects(runtime.step(), hasCode("RUNTIME_BUSY"));
    const extraRun = assert.rejects(runtime.run(), hasCode("RUNTIME_BUSY"));
    assert.throws(() => runtime.setFields({ count: 8 }), hasCode("RUNTIME_BUSY"));
    assert.throws(() => runtime.reset(), hasCode("RUNTIME_BUSY"));
    await Promise.all([pending, extraStep, extraRun]);
    assert.equal(runtime.getState().busy, false);
    assert.notEqual(runtime.getState().status, "failed");
    assert.equal((await runtime.run()).output.count, 3);
  }
});

test("reset clears progress, outputs, errors, and original inputs while retaining live state identity", async () => {
  const runtime = createRuntime(counterFlow(), { count: 2 });
  const state = await runtime.run();
  runtime.reset();
  assert.strictEqual(runtime.getState(), state);
  assert.equal(state.status, "ready");
  assert.equal(state.fields.count, 0);
  assert.equal(state.nextStepPath, "steps[0]");
  assert.equal(state.output, undefined);
  assert.equal(state.error, undefined);
  runtime.reset({ count: null });
  assert.equal(state.fields.count, null);
  assert.equal((await runtime.run()).output.count, 3);
});

test("setFields and reset validate atomically", async () => {
  const runtime = createRuntime(counterFlow());
  await runtime.step();
  const state = runtime.getState();
  assert.throws(() => runtime.setFields({ count: 5, unknown: 1 }), hasCode("UNKNOWN_FIELD"));
  assert.equal(state.fields.count, 0);
  assert.throws(() => runtime.setFields({ count: 5, missing: Infinity }), hasCode("UNKNOWN_FIELD"));
  assert.equal(state.fields.count, 0);
  assert.throws(
    () => runtime.reset({ count: 5, message: "not an input" }),
    hasCode("INVALID_INPUT"),
  );
  assert.equal(state.fields.count, 0);
  assert.equal(state.nextStepPath, "steps[1]");
  assert.equal(state.status, "running");
  assert.throws(() => createRuntime(counterFlow(), { absent: 1 }), hasCode("UNKNOWN_FIELD"));
});

test("initial data stays isolated while runtime inputs, assignment and set use references", async () => {
  const definition = flow([{ type: "set", field: "$copy", value: field("source") }], {
    source: { initial: { list: [1] }, input: true },
    copy: { output: true },
  });
  const input = { list: [2] };
  const first = createRuntime(definition, { source: input });
  const second = createRuntime(definition);
  input.list.push(9);
  definition.fields.source.initial.list.push(8);
  assert.strictEqual(first.getState().fields.source, input);
  assert.deepEqual(first.getState().fields.source, { list: [2, 9] });
  assert.deepEqual(second.getState().fields.source, { list: [1] });
  const assignment = { list: [3] };
  first.setFields({ source: assignment });
  assignment.list.push(9);
  await first.run();
  assert.deepEqual(first.getState().output.copy, { list: [3, 9] });
  assert.strictEqual(first.getState().fields.source, first.getState().fields.copy);
  assert.strictEqual(first.getState().fields.source, assignment);
  first.reset();
  assert.deepEqual(first.getState().fields.source, { list: [1] });
});

test("empty flows complete on execution and return defaults including undefined", async () => {
  const runtime = createRuntime(
    flow([], { a: { output: true }, b: { input: true, output: true, initial: false } }),
  );
  assert.equal(runtime.getState().status, "ready");
  const result = await runtime.step();
  assert.equal(result.event, null);
  assert.deepEqual(result.state.output, { a: undefined, b: false });
});

test("execution failures preserve earlier writes and expose nested paths", async () => {
  const runtime = createRuntime(
    flow([
      { type: "set", field: "$result", value: constant(7) },
      {
        type: "if",
        condition: "$result",
        then: [{ type: "divide", left: field("result"), right: constant(0), output: "$result" }],
      },
    ]),
  );
  const state = await runtime.run();
  assert.equal(state.status, "failed");
  assert.equal(state.busy, false);
  assert.equal(state.error.code, "DIVISION_BY_ZERO");
  assert.equal(state.error.path, "steps[1].then[0]");
  assert.equal(state.fields.result, 7);
  assert.equal(state.output, undefined);
  assert.throws(() => runtime.setFields({ result: 0 }), hasCode("RUNTIME_FINISHED"));
  runtime.reset();
  assert.equal(state.error, undefined);
});

for (const [type, left, right, expected] of [
  ["add", "2", 3, 5],
  ["subtract", "10", true, 9],
  ["multiply", "2", "3", 6],
  ["divide", "8", 2, 4],
  ["add", null, " ", 0],
  ["add", "", false, 0],
  ["greaterThan", "10", 2, true],
  ["lessThan", "2", 10, true],
  ["greaterThanOrEqual", "2", 2, true],
  ["lessThanOrEqual", 2, "2", true],
  ["equal", "2", 2, true],
  ["equal", true, "1", true],
  ["equal", "02", "2", false],
  ["equal", null, 0, false],
  ["equal", { a: 1, b: [2] }, { b: [2], a: 1 }, true],
  ["equal", ["2"], [2], false],
  ["equal", [], "", false],
  ["notEqual", "x", 0, true],
]) {
  test(`${type}: ${JSON.stringify(left)} and ${JSON.stringify(right)}`, async () => {
    const runtime = createRuntime(
      flow([{ type, left: constant(left), right: constant(right), output: "$result" }]),
    );
    assert.equal((await runtime.run()).output.result, expected);
  });
}

test("numeric conversion failures leave input and output unchanged", async () => {
  for (const value of ["hello", [], {}, "Infinity"]) {
    const runtime = createRuntime(
      flow([{ type: "add", left: field("input"), right: constant(1), output: "$result" }], {
        input: { initial: value },
        result: { initial: 42, output: true },
      }),
    );
    const state = await runtime.run();
    assert.equal(state.error.code, "INVALID_NUMBER");
    assert.equal(state.error.field, "$input");
    assert.equal(state.fields.result, 42);
    assert.deepEqual(state.fields.input, value);
  }
  const overflow = createRuntime(
    flow([{ type: "multiply", left: constant(1e308), right: constant(2), output: "$result" }]),
  );
  assert.equal((await overflow.run()).error.code, "INVALID_NUMBER");
});

test("logic always produces booleans using truthiness", async () => {
  const runtime = createRuntime(
    flow(
      [
        { type: "and", inputs: [constant({}), constant("yes")], output: "$a" },
        { type: "or", inputs: [constant(null), constant([])], output: "$b" },
        { type: "not", input: constant(0), output: "$c" },
      ],
      { a: { output: true }, b: { output: true }, c: { output: true } },
    ),
  );
  assert.deepEqual((await runtime.run()).output, { a: true, b: true, c: true });
});

test("invalid flow structures and obsolete features are rejected before execution", () => {
  const invalidSteps = [
    { type: "set", field: "$result" },
    { type: "and", inputs: [], output: "$result" },
    { type: "or", inputs: [], output: "$result" },
    { type: "call", output: "$result" },
    { type: "if", condition: "$result" },
    { type: "while", condition: "$result", body: [], maxIterations: 1 },
    { type: "set", id: "obsolete", field: "$result", value: constant(1) },
  ];
  for (const step of invalidSteps)
    assert.throws(() => createRuntime(flow([step])), hasCode("INVALID_FLOW"));
  assert.throws(() => createRuntime({ ...flow(), schemaVersion: 2 }), hasCode("INVALID_FLOW"));
  for (const maxIterations of [0, -1, 1.5, Infinity, "2", null]) {
    assert.throws(() => createRuntime(flow(), {}, { maxIterations }), hasCode("INVALID_OPTIONS"));
  }
  assert.throws(() => createRuntime(flow(), {}, { startAt: 1 }), hasCode("INVALID_OPTIONS"));
});

test("non-JSON definition initial values are rejected", () => {
  const circular = {};
  circular.self = circular;
  for (const value of [undefined, NaN, Infinity, new Date(), () => 1, circular, [, 1]]) {
    assert.throws(
      () => createRuntime(flow([], { result: { initial: value } })),
      hasCode("INVALID_VALUE"),
    );
  }
});

test("reserved prototype paths are rejected", () => {
  for (const name of ["__proto__", "constructor", "prototype"])
    assert.throws(
      () => createRuntime(flow([{ type: "set", field: `$${name}`, value: 1 }])),
      hasCode("INVALID_FLOW"),
    );
});

test("the documented complete flow runs with defaults and overridden inputs", async () => {
  const document = readFileSync(new URL("../docs/v1-requirements.md", import.meta.url), "utf8");
  const definitions = [...document.matchAll(/```json\s*\n([\s\S]*?)\n```/g)]
    .map((match) => JSON.parse(match[1]))
    .filter((value) => value.schemaVersion === 1 && value.steps.length > 0);
  assert.equal(definitions.length, 1);
  const definition = definitions[0];
  assert.deepEqual((await createRuntime(definition).run()).output, {
    count: 3,
    message: "已完成计数",
  });
  assert.deepEqual((await createRuntime(definition, { count: 3, target: 3 }).run()).output, {
    count: 3,
    message: "无需计数",
  });
});

test("all operand and destination fields are collected before execution, including skipped branches", async () => {
  const definition = {
    schemaVersion: 1,

    name: "Implicit fields",
    fields: {},
    steps: [
      {
        type: "if",
        condition: "$condition",
        then: [
          { type: "set", field: "$copy", value: "$source" },
          { type: "add", left: "$left", right: "$right", output: "$sum" },
        ],
        else: [
          {
            type: "while",
            condition: "$loopCondition",
            body: [
              { type: "template", template: "$textA$$textB$", output: "$text" },
              { type: "and", inputs: ["$flagA", "$flagB"], output: "$both" },
              { type: "or", inputs: ["$flagA", "$flagB"], output: "$either" },
              { type: "not", input: "$flagA", output: "$inverse" },
              { type: "equal", left: "$left", right: "$right", output: "$equal" },
            ],
          },
        ],
      },
    ],
  };
  const runtime = createRuntime(definition);
  const expected = [
    "condition",
    "copy",
    "source",
    "left",
    "right",
    "sum",
    "loopCondition",
    "textA",
    "textB",
    "text",
    "flagA",
    "flagB",
    "both",
    "either",
    "inverse",
    "equal",
  ];
  assert.deepEqual(
    runtime.getState().fields,
    Object.fromEntries(expected.map((key) => [key, undefined])),
  );
  assert.deepEqual(definition.fields, {});
  assert.equal((await runtime.run()).status, "completed");
  assert.deepEqual(runtime.getState().output, {});
});

test("implicit fields can be edited and reset but are not external inputs or outputs", async () => {
  const definition = flow([{ type: "set", value: "$source", field: "$result" }]);
  const runtime = createRuntime(definition);
  assert.equal(runtime.getState().fields.source, undefined);
  runtime.setFields({ source: { text: "value" } });
  assert.deepEqual((await runtime.run()).output, { result: { text: "value" } });
  runtime.reset();
  assert.equal(runtime.getState().fields.source, undefined);
  assert.deepEqual((await runtime.run()).output, { result: undefined });
  assert.throws(() => createRuntime(definition, { source: 1 }), hasCode("INVALID_INPUT"));
  runtime.reset();
  assert.throws(() => runtime.setFields({ unrelated: 1 }), hasCode("UNKNOWN_FIELD"));
});

test("explicit references preserve implicit fields and unchecked spelling", async () => {
  const runtime = createRuntime(
    flow(
      [
        { type: "set", value: "$hello", field: "$result" },
        { type: "add", left: "$misspelled", right: "$increment", output: "$temporary" },
      ],
      { increment: { initial: 1 }, result: { output: true } },
    ),
  );
  assert.equal((await runtime.run()).status, "completed");
  assert.equal(runtime.getState().fields.temporary, 1);
  assert.equal(runtime.getState().fields.result, undefined);
  assert.equal(runtime.getState().fields.misspelled, undefined);
});

test("inherited names remain safe own fields", async () => {
  const runtime = createRuntime(flow([{ type: "set", field: "$toString", value: 5 }], {}));
  await runtime.run();
  assert.equal(runtime.getState().fields.toString, 5);
  assert.equal(Object.getPrototypeOf(runtime.getState().fields), Object.prototype);
});

test("unset values coerce to zero in arithmetic and ordering without mutating source fields", async () => {
  for (const [type, expected] of [
    ["add", 2],
    ["subtract", -2],
    ["multiply", 0],
    ["divide", 0],
    ["lessThan", true],
    ["greaterThan", false],
    ["lessThanOrEqual", true],
    ["greaterThanOrEqual", false],
  ]) {
    const runtime = createRuntime(
      flow([{ type, left: "$missing.value", right: 2, output: "$result" }]),
    );
    const state = await runtime.run();
    assert.equal(state.status, "completed");
    assert.equal(state.output.result, expected);
    assert.equal(state.fields.missing, undefined);
  }
  const division = createRuntime(
    flow([{ type: "divide", left: 1, right: "$unset", output: "$result" }]),
  );
  assert.equal((await division.run()).error.code, "DIVISION_BY_ZERO");
});
