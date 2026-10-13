import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createRuntime, RuntimeError } from "../dist/index.js";
import { graph } from "./graph-fixture.mjs";

const flow = (steps = [], fields = {}, id = "root") => ({
  schemaVersion: 1,
  name: id,
  steps,
  fields,
});
const call = (id, extra = {}) => ({ type: "call", target: id, ...extra });
const code = (expected) => (error) => error instanceof RuntimeError && error.code === expected;
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("sync function receives an independent input container with shared values and no runtime", async () => {
  const object = { count: 1 };
  const root = createRuntime(
    flow([call("update", { inputs: { value: "$data" }, output: "$result" })], {
      data: { input: true },
      result: { output: true },
    }),
    { data: object },
    {
      functions: {
        update(...args) {
          assert.equal(args.length, 1);
          const inputs = args[0];
          assert.notStrictEqual(inputs, root.getState().fields);
          assert.strictEqual(inputs.value, object);
          inputs.value.count++;
          inputs.value = "only the parameter container changes";
          return object;
        },
      },
    },
  );
  const result = await root.step();
  assert.equal(result.event.type, "call");
  assert.equal(result.event.childInvocationId, undefined);
  assert.equal(root.getStack().length, 1);
  assert.equal(root.getState().status, "completed");
  assert.strictEqual(result.state.output.result, object);
  assert.strictEqual(root.getState().fields.data, object);
  assert.equal(object.count, 2);
});

test("undefined is the default; missing inputs preserve defaults and explicit undefined overwrites them", async () => {
  const definition = flow([{ type: "set", value: "$implicit", field: "$copy" }], {
    value: { initial: 7, input: true, output: true },
    nil: { initial: null, output: true },
    copy: { output: true },
  });
  const root = createRuntime(definition);
  assert.equal(root.getState().fields.implicit, undefined);
  assert.deepEqual((await root.run()).output, { value: 7, nil: null, copy: undefined });
  root.reset({ value: undefined });
  assert.equal(root.getState().fields.value, undefined);
  root.reset();
  assert.equal(root.getState().fields.value, 7);
  const received = [];
  const parent = createRuntime(
    graph(
      flow(
        [
          call("capture"),
          call("capture", { inputs: { missing: "$unset" } }),
          {
            type: "call",
            target: "child",
            inputs: { value: "$unset" },
            output: "$childResult",
          },
        ],
        { childResult: { output: true } },
      ),
      [{ ...definition, name: "child" }],
    ),
    {},
    {
      functions: {
        capture: (inputs) => {
          received.push(inputs);
        },
      },
    },
  );
  await parent.run();
  assert.deepEqual(received, [{}, { missing: undefined }]);
  assert.equal(parent.getState().output.childResult.value, undefined);
});

test("arbitrary runtime values preserve identity through inputs, setFields, set and child calls", async () => {
  const cycle = {};
  cycle.self = cycle;
  const values = [
    undefined,
    null,
    new Uint8Array([1, 2]),
    new ArrayBuffer(2),
    new Blob(["hi"]),
    new Date(),
    new Map(),
    new Set(),
    cycle,
    () => 1,
    Symbol("x"),
    1n,
    NaN,
    Infinity,
  ];
  const child = flow(
    [{ type: "set", value: "$value", field: "$result" }],
    { value: { input: true }, result: { output: true } },
    "child",
  );
  for (const value of values) {
    const root = createRuntime(
      graph(
        flow(
          [
            {
              type: "call",
              target: "child",
              inputs: { value: "$input" },
              outputs: { result: "$output" },
            },
          ],
          { input: { input: true }, output: { output: true } },
        ),
        [child],
      ),
      { input: value },
      {},
    );
    assert.strictEqual(root.getState().fields.input, value);
    root.setFields({ input: value });
    assert.strictEqual((await root.run()).output.output, value);
    root.reset();
    assert.equal(root.getState().fields.input, undefined);
  }
});

test("function returns need not be JSON, including absent return values", async () => {
  const cycle = {};
  cycle.self = cycle;
  for (const value of [
    undefined,
    null,
    4,
    "text",
    new Uint8Array([2]),
    new Blob(["x"]),
    cycle,
    new Map(),
    () => 1,
    Symbol("x"),
    2n,
  ]) {
    const root = createRuntime(
      flow([call("produce", { output: "$result" })], { result: { initial: "old", output: true } }),
      {},
      {
        functions: { produce: async () => value },
      },
    );
    assert.strictEqual((await root.run()).output.result, value);
    assert.ok(Object.hasOwn(root.getState().output, "result"));
  }
});

test("mapped outputs use own properties only and overwrite missing values with undefined", async () => {
  const result = Object.create({ inherited: 9 });
  result.present = undefined;
  Object.defineProperty(result, "hidden", { value: 3 });
  const root = createRuntime(
    flow(
      [
        call("produce", {
          outputs: { absent: "$a", inherited: "$b", present: "$c", hidden: "$d" },
        }),
      ],
      {
        a: { initial: 1, output: true },
        b: { initial: 2, output: true },
        c: { initial: 3, output: true },
        d: { output: true },
      },
    ),
    {},
    { functions: { produce: () => result } },
  );
  assert.deepEqual((await root.run()).output, { a: undefined, b: undefined, c: undefined, d: 3 });
  for (const empty of [null, undefined, 2, true]) {
    const runtime = createRuntime(
      flow([call("produce", { outputs: { missing: "$result" } })], {
        result: { initial: 1, output: true },
      }),
      {},
      {
        functions: { produce: () => empty },
      },
    );
    assert.deepEqual((await runtime.run()).output, { result: undefined });
  }
});

test("missing and non-exported child outputs also map to undefined", async () => {
  const child = flow([], { private: { initial: 3 } }, "child");
  const root = createRuntime(
    graph(
      flow(
        [
          {
            type: "call",
            target: "child",
            outputs: { missing: "$a", private: "$b" },
          },
        ],
        { a: { initial: 1, output: true }, b: { initial: 2, output: true } },
      ),
      [child],
    ),
    {},
    {},
  );
  assert.deepEqual((await root.run()).output, { a: undefined, b: undefined });
});

test("async function is one step and keeps every layer busy until its promise resolves", async () => {
  const entered = deferred();
  const finish = deferred();
  const childFlow = flow(
    [call("wait", { output: "$value" }), { type: "set", value: "$value", field: "$copy" }],
    { value: { output: true } },
    "child",
  );
  const root = createRuntime(
    graph(flow([{ type: "call", target: "child", output: "$result" }]), [childFlow]),
    {},
    {
      functions: {
        wait: () => {
          entered.resolve();
          return finish.promise;
        },
      },
    },
  );
  await root.step();
  const child = root.getStack().at(-1);
  const pending = root.step();
  await entered.promise;
  try {
    for (const runtime of [root, child]) {
      assert.equal(runtime.getState().busy, true);
      assert.throws(() => runtime.setFields({ value: 1 }), code("RUNTIME_BUSY"));
      assert.throws(() => runtime.reset(), code("RUNTIME_BUSY"));
      await assert.rejects(runtime.step(), code("RUNTIME_BUSY"));
      await assert.rejects(runtime.run(), code("RUNTIME_BUSY"));
    }
    assert.equal(root.getStack().length, 2);
    assert.equal(child.getState().nextStepPath, "steps[0]");
    assert.equal(child.getState().fields.value, undefined);
  } finally {
    finish.resolve(new Uint8Array([7]));
  }
  const result = await pending;
  assert.equal(result.event.invocationId, child.invocationId);
  assert.equal(child.getState().busy, false);
  assert.equal(child.getState().nextStepPath, "steps[1]");
  await child.run();
  assert.strictEqual(root.getState().fields.result.value, child.getState().fields.value);
});

test("run awaits functions before advancing and retains its boundary inside a child", async () => {
  const entered = deferred();
  const finish = deferred();
  const child = flow([call("wait", { output: "$value" })], { value: { output: true } }, "child");
  const root = createRuntime(
    graph(
      flow([
        { type: "call", target: "child", outputs: { value: "$result" } },
        call("after", { output: "$after" }),
      ]),
      [child],
    ),
    {},
    {
      functions: {
        wait: () => {
          entered.resolve();
          return finish.promise;
        },
        after: () => "parent continued",
      },
    },
  );
  await root.step();
  const instance = root.getStack().at(-1);
  const pending = instance.run();
  await entered.promise;
  assert.equal(root.getState().fields.after, undefined);
  finish.resolve(8);
  await pending;
  assert.equal(root.getState().fields.result, 8);
  assert.equal(root.getState().fields.after, undefined);
  await root.run();
  assert.equal(root.getState().fields.after, "parent continued");
});

test("function failures preserve assignments but cannot undo shared-object side effects", async () => {
  for (const asyncFailure of [false, true]) {
    let calls = 0;
    const shared = { changed: false };
    const child = flow(
      [call("fail", { inputs: { data: "$data" }, output: "$result" })],
      { data: { input: true }, result: { initial: "old", output: true } },
      "child",
    );
    const handler = ({ data }) => {
      calls++;
      data.changed = true;
      throw new Error("request failed");
    };
    const root = createRuntime(
      graph(
        flow(
          [
            {
              type: "call",
              target: "child",
              inputs: { data: "$data" },
              outputs: { result: "$result" },
            },
          ],
          {
            data: { input: true },
            result: { initial: "parent old" },
          },
        ),
        [child],
      ),
      { data: shared },
      { functions: { fail: asyncFailure ? async (inputs) => handler(inputs) : handler } },
    );
    const state = await root.run();
    assert.equal(state.status, "failed");
    assert.equal(state.busy, false);
    assert.equal(state.error.flowName, "child");
    assert.equal(state.error.path, "steps[0]");
    assert.equal(state.fields.result, "parent old");
    assert.equal(root.getStack().at(-1).getState().fields.result, "old");
    assert.equal(shared.changed, true);
    await root.run();
    assert.equal(calls, 1);
  }
});

test("mapped getters are resolved before committing any destination", async () => {
  const root = createRuntime(
    flow([call("produce", { outputs: { first: "$a", second: "$b" } })], {
      a: { initial: "old a" },
      b: { initial: "old b" },
    }),
    {},
    {
      functions: {
        produce: () => ({
          first: 1,
          get second() {
            throw new Error("getter failed");
          },
        }),
      },
    },
  );
  assert.equal((await root.run()).status, "failed");
  assert.equal(root.getState().fields.a, "old a");
  assert.equal(root.getState().fields.b, "old b");
});

test("arbitrary thrown values still yield a failed state and release the busy lock", async () => {
  for (const thrown of [undefined, "failed", Object.create(null)]) {
    const runtime = createRuntime(
      flow([call("fail")]),
      {},
      {
        functions: {
          fail() {
            throw thrown;
          },
        },
      },
    );
    const state = await runtime.run();
    assert.equal(state.status, "failed");
    assert.equal(state.busy, false);
    assert.equal(state.error.code, "EXECUTION_ERROR");
  }
});

test("host function registries are checked, captured once, and shared with children", async () => {
  assert.throws(() => createRuntime(flow([call("unknown")])), code("INVALID_FLOW"));
  assert.throws(() => createRuntime(flow(), {}, { functions: [] }), code("INVALID_OPTIONS"));
  assert.throws(
    () => createRuntime(flow(), {}, { functions: { bad: 1 } }),
    code("INVALID_OPTIONS"),
  );
  const registry = { echo: ({ value }) => value };
  const definition = flow([call("echo", { inputs: { value: "$value" }, output: "$result" })], {
    value: { initial: 3 },
    result: { output: true },
  });
  const runtime = createRuntime(definition, {}, { functions: registry });
  registry.echo = () => 99;
  assert.equal((await runtime.run()).output.result, 3);
});

test("non-JSON equality uses identity and text conversion requires explicit handling", async () => {
  const cycle = {};
  cycle.self = cycle;
  const cases = [
    [new Uint8Array([1]), new Uint8Array([1]), false],
    [cycle, cycle, true],
    [new Date(0), new Date(0), false],
    [{ a: 1 }, { a: 1 }, true],
    [undefined, undefined, true],
  ];
  for (const [left, right, expected] of cases) {
    const runtime = createRuntime(
      flow([{ type: "equal", left: "$left", right: "$right", output: "$result" }], {
        left: { input: true },
        right: { input: true },
        result: { output: true },
      }),
      { left, right },
    );
    assert.equal((await runtime.run()).output.result, expected);
  }
  for (const value of [new Uint8Array([1]), cycle, new Date(), 1n]) {
    const runtime = createRuntime(
      flow([{ type: "template", template: "$value$", output: "$result" }], {
        value: { input: true },
      }),
      { value },
    );
    assert.equal((await runtime.run()).error.code, "INVALID_TEXT");
  }
  const empty = createRuntime(
    flow([{ type: "template", template: "$absent$$null$", output: "$result" }], {
      null: { initial: null },
      result: { output: true },
    }),
  );
  assert.equal((await empty.run()).output.result, "null");
});

test("HTTP lives in the host function and can return actual binary response data", async (t) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(Buffer.from([0, 127, 255]));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/file`;
  const runtime = createRuntime(
    flow([call("download", { inputs: { url: "$url" }, output: "$file" })], {
      url: { input: true },
      file: { output: true },
    }),
    { url },
    {
      functions: {
        download: async ({ url }) => {
          const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        },
      },
    },
  );
  const state = await runtime.run();
  assert.equal(state.status, "completed");
  assert.ok(state.output.file instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(state.output.file)], [0, 127, 255]);
});
