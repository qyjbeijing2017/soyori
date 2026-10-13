import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime, parseFlow } from "../dist/index.js";

const flow = (steps, fields = { result: { output: true } }) => ({
  schemaVersion: 1,
  name: "Operands",
  fields,
  steps,
});

test("literal trees resolve references and escapes without interpreting data returned by references", async () => {
  const source = { text: "$notAReference" };
  const runtime = createRuntime(
    flow(
      [
        {
          type: "set",
          field: "$result",
          value: {
            text: "hello",
            number: 10,
            flag: true,
            nil: null,
            escaped: "$$name",
            nested: ["$source", "$source.text", "$$$name"],
          },
        },
      ],
      { source: { input: true }, result: { output: true } },
    ),
    { source },
  );
  const state = await runtime.run();
  assert.equal(state.status, "completed");
  assert.deepEqual(state.output.result, {
    text: "hello",
    number: 10,
    flag: true,
    nil: null,
    escaped: "$name",
    nested: [source, "$notAReference", "$$name"],
  });
  assert.strictEqual(state.output.result.nested[0], source);
  assert.deepEqual(
    Object.keys(
      parseFlow(
        flow([
          {
            type: "set",
            field: "$result.x",
            value: { a: "$source.y", b: "ordinary", c: "$$escaped" },
          },
        ]),
      ).fields,
    ),
    ["result", "source"],
  );
});

test("write paths replace incompatible containers and preserve compatible siblings", async () => {
  for (const initial of [
    null,
    123,
    "text",
    false,
    [],
    { keep: 1, options: false },
    { keep: 1, options: { other: 2 } },
  ]) {
    const runtime = createRuntime(
      flow([{ type: "set", field: "$result.options.temperature", value: 0.7 }], {
        result: { initial, output: true },
      }),
    );
    const state = await runtime.run();
    assert.equal(state.status, "completed");
    assert.equal(state.output.result.options.temperature, 0.7);
    if (initial?.keep) assert.equal(state.output.result.keep, 1);
    if (initial?.options?.other) assert.equal(state.output.result.options.other, 2);
  }
});

test("numeric indices create arrays, fill nulls and append one item without flattening", async () => {
  const runtime = createRuntime(
    flow([
      { type: "set", field: "$result.items[2].content", value: "hello" },
      { type: "append", field: "$result.items", value: [1, 2] },
      {
        type: "append",
        field: "$result.other",
        value: { role: "user", content: "$result.items[2].content" },
      },
      { type: "set", field: "$result.replace", value: 12 },
      { type: "append", field: "$result.replace", value: true },
    ]),
  );
  assert.deepEqual((await runtime.run()).output.result, {
    items: [null, null, { content: "hello" }, [1, 2]],
    other: [{ role: "user", content: "hello" }],
    replace: [true],
  });
});

test("literal containers are fresh on every iteration and reset leaves definitions untouched", async () => {
  const definition = flow(
    [
      {
        type: "while",
        condition: "$again",
        body: [
          { type: "append", field: "$result", value: { items: [] } },
          { type: "add", left: "$count", right: 1, output: "$count" },
          { type: "lessThan", left: "$count", right: 2, output: "$again" },
        ],
      },
    ],
    { result: { initial: [], output: true }, count: { initial: 0 }, again: { initial: true } },
  );
  const runtime = createRuntime(definition);
  const result = (await runtime.run()).output.result;
  result[0].items.push(1);
  assert.deepEqual(result[1].items, []);
  runtime.reset();
  assert.deepEqual(runtime.getState().fields.result, []);
  assert.deepEqual(definition.fields.result.initial, []);
});

test("quoted keys, Unicode names and missing reads work without creating data", async () => {
  const runtime = createRuntime(
    flow([
      { type: "set", field: '$["a.b"]["x y"]["quote\\"key"]', value: 7 },
      { type: "set", field: "$结果", value: '$["a.b"]["x y"]["quote\\"key"]' },
      { type: "set", field: "$result", value: "$missing.deep.value" },
    ]),
  );
  const state = await runtime.run();
  assert.equal(state.fields.结果, 7);
  assert.equal(state.output.result, undefined);
  assert.equal(state.fields.missing, undefined);
});

test("all operations share operand resolution and destination writing", async () => {
  const state = await createRuntime(
    flow([
      { type: "add", left: 2, right: 3, output: "$result.count" },
      { type: "equal", left: "$result.count", right: 5, output: "$result.ok" },
      {
        type: "if",
        condition: "$result.ok",
        then: [{ type: "template", template: "count=$result.count$", output: "$result.text" }],
      },
      { type: "and", inputs: [true, "$result.ok"], output: "$result.and" },
      { type: "or", inputs: [false, "$result.ok"], output: "$result.or" },
      { type: "not", input: false, output: "$result.not" },
      { type: "while", condition: false, body: [{ type: "set", field: "$result", value: null }] },
    ]),
  ).run();
  assert.deepEqual(state.output.result, {
    count: 5,
    ok: true,
    text: "count=5",
    and: true,
    or: true,
    not: true,
  });
});

test("function inputs resolve nested templates; mapped outputs use paths and stay opaque", async () => {
  const runtime = createRuntime(
    flow(
      [
        {
          type: "call",
          target: "tool",
          inputs: { options: { query: "$query", limit: 10 } },
          outputs: { text: "$result.items[1]", missing: "$result.absent" },
        },
      ],
      { query: { initial: "hello" }, result: { output: true } },
    ),
    {},
    {
      functions: {
        tool: ({ options }) => {
          assert.deepEqual(options, { query: "hello", limit: 10 });
          return { text: "$literal" };
        },
      },
    },
  );
  assert.deepEqual((await runtime.run()).output.result, {
    items: [null, "$literal"],
    absent: undefined,
  });
});

test("subflow inputs accept literals and return to a nested parent destination", async () => {
  const child = {
    definition: flow([{ type: "append", field: "$data.messages", value: "child" }], {
      data: { input: true, output: true },
    }),
    imports: new Map(),
  };
  const runtime = createRuntime({
    definition: flow([
      {
        type: "call",
        target: "child",
        inputs: { data: { messages: [] } },
        outputs: { data: "$result.child" },
      },
    ]),
    imports: new Map([["child", child]]),
  });
  assert.deepEqual((await runtime.run()).output.result, { child: { messages: ["child"] } });
});

test("path writes retain identity for shared objects and arrays", async () => {
  const shared = { items: [] };
  const runtime = createRuntime(
    flow(
      [
        { type: "set", field: "$result", value: "$source" },
        { type: "set", field: "$result.count", value: 1 },
        { type: "append", field: "$result.items", value: 2 },
      ],
      { source: { input: true }, result: { output: true } },
    ),
    { source: shared },
  );
  assert.strictEqual((await runtime.run()).output.result, shared);
  assert.deepEqual(shared, { count: 1, items: [2] });
});

test("invalid, unsafe, expression and oversized paths fail validation even in skipped branches", () => {
  for (const reference of [
    "$",
    "$$x",
    "$x..y",
    "$x[",
    "$x[abc]",
    "$x[-1]",
    "$x[1.5]",
    "$x[10000]",
    "$x + 1",
    "$x.__proto__.polluted",
    '$x["constructor"]["prototype"]',
    '$x["\\u005f_proto__"]',
  ]) {
    assert.throws(
      () =>
        parseFlow(
          flow([
            { type: "if", condition: false, then: [{ type: "set", field: reference, value: 1 }] },
          ]),
        ),
      { code: "INVALID_FLOW" },
    );
  }
  assert.throws(
    () => parseFlow(flow([{ type: "set", field: "$result", value: { nested: "$x[" } }])),
    { code: "INVALID_FLOW" },
  );
  assert.equal(Object.prototype.polluted, undefined);
});

test("array growth and append are bounded without changing previous contents", async () => {
  const array = Array(10_000).fill(0);
  const runtime = createRuntime(
    flow([{ type: "append", field: "$result", value: 1 }], {
      result: { input: true, output: true },
    }),
    { result: array },
  );
  assert.equal((await runtime.run()).error.code, "ARRAY_LIMIT");
  assert.equal(array.length, 10_000);
  const boundary = createRuntime(flow([{ type: "set", field: "$result[9999]", value: 1 }]));
  assert.equal((await boundary.run()).output.result.length, 10_000);
  const nested = createRuntime(flow([{ type: "set", field: "$result[9999][9999]", value: 1 }]));
  assert.equal((await nested.run()).error.code, "ARRAY_LIMIT");
  assert.equal(nested.getState().fields.result, undefined);
});

test("call writes are staged when a later destination is frozen or has an accessor", async () => {
  let calls = 0;
  for (const blocked of [
    Object.freeze({ x: 1 }),
    Object.defineProperty({}, "x", {
      get() {
        calls++;
        return 1;
      },
    }),
  ]) {
    const runtime = createRuntime(
      flow(
        [
          {
            type: "call",
            target: "tool",
            outputs: { a: "$result.created", b: "$blocked.x" },
          },
        ],
        { result: { initial: 0 }, blocked: { input: true } },
      ),
      { blocked },
      { functions: { tool: () => ({ a: 2, b: 3 }) } },
    );
    assert.equal((await runtime.run()).error.code, "INVALID_VALUE");
    assert.equal(runtime.getState().fields.result, 0);
  }
  assert.equal(calls, 0);
});

test("failed child output write reports the parent call path and preserves both destinations", async () => {
  const child = {
    definition: flow([{ type: "set", field: "$a", value: 2 }], {
      a: { output: true },
      b: { initial: 3, output: true },
    }),
    imports: new Map(),
  };
  const root = createRuntime(
    {
      definition: flow(
        [
          {
            type: "call",
            target: "child",
            outputs: { a: "$result.ok", b: "$blocked.x" },
          },
        ],
        { result: { initial: 0 }, blocked: { input: true } },
      ),
      imports: new Map([["child", child]]),
    },
    { blocked: Object.freeze({ x: 1 }) },
  );
  await root.step();
  const last = await root.step();
  assert.equal(root.getState().status, "failed");
  assert.equal(last.event.error.invocationId, root.invocationId);
  assert.equal(last.event.error.path, "steps[0]");
  assert.equal(root.getState().fields.result, 0);
});

test("duplicate and overlapping output paths are rejected independent of spelling", () => {
  for (const outputs of [
    { a: "$result", b: "$result.x" },
    { a: "$result.x", b: '$result["x"]' },
    { a: "$result[0]", b: '$result["0"]' },
  ])
    assert.throws(() => parseFlow(flow([{ type: "call", target: "tool", outputs }])), {
      code: "INVALID_FLOW",
    });
});

test("cascading return failures remain visible on the executed leaf event", async () => {
  const leaf = {
    definition: flow([{ type: "set", field: "$result", value: 3 }]),
    imports: new Map(),
  };
  const middle = {
    definition: flow([{ type: "call", target: "leaf", outputs: { result: "$result" } }]),
    imports: new Map([["leaf", leaf]]),
  };
  const root = createRuntime(
    {
      definition: flow(
        [
          {
            type: "call",
            target: "middle",
            outputs: { result: "$blocked.x" },
          },
        ],
        { blocked: { input: true } },
      ),
      imports: new Map([["middle", middle]]),
    },
    { blocked: Object.freeze({ x: 1 }) },
  );
  await root.step();
  await root.step();
  const last = await root.step();
  assert.equal(last.state.status, "completed");
  assert.equal(last.event.error.invocationId, root.invocationId);
  assert.equal(root.getState().status, "failed");
  assert.equal(root.getState().fields.blocked.x, 1);
});

test("reads do not traverse prototypes or execute getters; initial strings stay literal", async () => {
  let calls = 0;
  const object = Object.create({ inherited: 9 });
  Object.defineProperty(object, "getter", {
    get() {
      calls++;
      return 3;
    },
  });
  const runtime = createRuntime(
    flow(
      [
        { type: "set", field: "$result", value: "$source.inherited" },
        { type: "set", field: "$result", value: "$source.getter" },
      ],
      { source: { input: true }, literal: { initial: "$missing" }, result: { output: true } },
    ),
    { source: object },
  );
  await runtime.step();
  assert.equal(runtime.getState().fields.result, undefined);
  assert.equal(runtime.getState().fields.literal, "$missing");
  assert.equal((await runtime.run()).error.code, "INVALID_VALUE");
  assert.equal(calls, 0);
});
