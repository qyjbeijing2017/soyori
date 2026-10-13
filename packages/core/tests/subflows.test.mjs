import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime, RuntimeError } from "../dist/index.js";
import { graph } from "./graph-fixture.mjs";

const flow = (id, steps = [], fields = {}) => ({ schemaVersion: 1, name: id, fields, steps });
const call = (id, extra = {}) => ({ type: "call", target: id, ...extra });
const add = (output = "count") => ({
  type: "add",
  left: `$${output}`,
  right: "$one",
  output: `$${output}`,
});
const fields = () => ({ count: { initial: 0, input: true, output: true }, one: { initial: 1 } });
const code = (expected) => (error) => error instanceof RuntimeError && error.code === expected;
const increment = () => flow("increment", [add(), add()], fields());
function parent() {
  return flow(
    "parent",
    [call("increment", { inputs: { count: "$count" }, outputs: { count: "$count" } }), add()],
    fields(),
  );
}

test("call enters a real child runtime; parent and child step both execute the stack top", async () => {
  const root = createRuntime(graph(parent(), [increment()]), { count: 2 }, {});
  const stack = root.getStack();
  assert.deepEqual(stack, [root]);
  const entered = await root.step();
  const child = stack.at(-1);
  assert.equal(stack.length, 2);
  assert.equal(child.flowName, "increment");
  assert.equal(child.invocationId, entered.event.childInvocationId);
  assert.equal(entered.event.invocationId, root.invocationId);
  assert.equal(entered.state.status, "waiting");
  assert.equal(root.getState().nextStepPath, "steps[0]");
  assert.equal(child.getState().status, "ready");
  assert.equal(child.getState().depth, 2);
  assert.equal(child.getState().fields.count, 2);
  assert.strictEqual(child.getStack(), stack);
  const first = await root.step();
  assert.equal(first.event.invocationId, child.invocationId);
  assert.equal(first.event.flowName, "increment");
  assert.strictEqual(first.state, child.getState());
  assert.equal(child.getState().fields.count, 3);
  const last = await child.step();
  assert.equal(last.event.path, "steps[1]");
  assert.equal(last.event.invocationId, child.invocationId);
  assert.equal(last.state.status, "completed");
  assert.deepEqual(stack, [root]);
  assert.equal(root.getState().fields.count, 4);
  assert.equal(root.getState().nextStepPath, "steps[1]");
  assert.equal((await root.run()).output.count, 5);
});

test("child run stops after itself and never executes the parent's next step", async () => {
  const root = createRuntime(graph(parent(), [increment()]), {}, {});
  await root.step();
  const child = root.getStack().at(-1);
  child.setFields({ count: 10 });
  const state = await child.run();
  assert.equal(state.output.count, 12);
  assert.equal(root.getState().fields.count, 12);
  assert.equal(root.getState().status, "running");
  assert.equal((await child.step()).event, null);
  assert.strictEqual(await child.run(), state);
  assert.equal(root.getState().fields.count, 12);
  assert.throws(() => child.setFields({ count: 0 }), code("RUNTIME_FINISHED"));
  assert.throws(() => child.reset(), code("ROOT_RESET_ONLY"));
  assert.equal((await root.run()).output.count, 13);
});

test("run called on a waiting ancestor executes descendants only up to that ancestor", async () => {
  const middle = flow(
    "middle",
    [call("increment", { inputs: { count: "$count" }, outputs: { count: "$count" } }), add()],
    fields(),
  );
  const outer = flow("outer", [call("middle", { outputs: { count: "$count" } }), add()], fields());
  const root = createRuntime(graph(outer, [middle, increment()]), {}, {});
  await root.step();
  const a = root.getStack().at(-1);
  await a.step();
  const b = root.getStack().at(-1);
  assert.equal(a.getState().status, "waiting");
  assert.equal(b.getState().depth, 3);
  const result = await a.run();
  assert.equal(result.output.count, 3);
  assert.equal(b.getState().status, "completed");
  assert.equal(root.getState().fields.count, 3);
  assert.equal(root.getState().nextStepPath, "steps[1]");
  assert.equal((await root.run()).output.count, 4);
});

test("last child step cascades structural returns without an extra executable step", async () => {
  const leaf = flow("leaf", [add()], fields());
  const middle = flow("middle", [call("leaf", { outputs: { count: "$count" } })], fields());
  const root = createRuntime(
    graph(flow("root", [call("middle", { outputs: { count: "$count" } })], fields()), [
      middle,
      leaf,
    ]),
    {},
    {},
  );
  await root.step();
  const a = root.getStack().at(-1);
  await root.step();
  const b = root.getStack().at(-1);
  const result = await b.step();
  assert.equal(result.event.invocationId, b.invocationId);
  assert.equal(a.getState().status, "completed");
  assert.equal(root.getState().status, "completed");
  assert.deepEqual(root.getState().output, { count: 1 });
  assert.equal(root.getStack().length, 1);
});

test("empty child completes in the call step, using defaults and explicit undefined", async () => {
  const empty = flow("empty", [], {
    a: { initial: 7, input: true, output: true },
    b: { input: true, output: true },
  });
  const root = createRuntime(
    graph(
      flow("root", [call("empty", { inputs: { b: "$missing" }, output: "$result" })], {
        result: { output: true },
      }),
      [empty],
    ),
    {},
    {},
  );
  const result = await root.step();
  assert.equal(result.event.type, "call");
  assert.ok(result.event.childInvocationId);
  assert.equal(result.state.status, "completed");
  assert.deepEqual(result.state.output, { result: { a: 7, b: undefined } });
  assert.equal(root.getStack().length, 1);
});

test("child inputs are captured at entry, outputs override intervening parent edits", async () => {
  const root = createRuntime(graph(parent(), [increment()]), { count: 2 }, {});
  await root.step();
  const child = root.getStack().at(-1);
  root.setFields({ count: 100 });
  assert.equal(child.getState().fields.count, 2);
  child.setFields({ count: 5 });
  assert.equal(root.getState().fields.count, 100);
  await child.step();
  assert.equal(root.getState().fields.count, 100);
  await child.run();
  assert.equal(root.getState().fields.count, 7);
});

test("containers are isolated while objects are shared across input and output mappings", async () => {
  const childFlow = flow("objects", [{ type: "set", field: "$other", value: "$data" }], {
    data: { input: true, output: true },
    other: { output: true },
  });
  const root = createRuntime(
    graph(
      flow(
        "root",
        [
          call("objects", {
            inputs: { data: "$original" },
            outputs: { data: "$first", other: "$second" },
          }),
        ],
        { original: { initial: { list: [1] } }, first: { output: true }, second: { output: true } },
      ),
      [childFlow],
    ),
    {},
    {},
  );
  await root.step();
  const child = root.getStack().at(-1);
  assert.strictEqual(child.getState().fields.data, root.getState().fields.original);
  root.setFields({ original: { list: [9] } });
  await child.run();
  assert.deepEqual(root.getState().output, { first: { list: [1] }, second: { list: [1] } });
  assert.strictEqual(root.getState().fields.first, child.getState().fields.data);
  assert.strictEqual(root.getState().fields.first, root.getState().fields.second);
});

test("busy lock is shared across every runtime and rejection never fails the active run", async () => {
  for (const method of ["step", "run"]) {
    const root = createRuntime(graph(parent(), [increment()]), {}, {});
    await root.step();
    const child = root.getStack().at(-1);
    const pending = child[method]();
    assert.equal(root.getState().busy, true);
    assert.equal(child.getState().busy, true);
    const rejected = [root, child].flatMap((runtime) => [
      assert.rejects(runtime.step(), code("RUNTIME_BUSY")),
      assert.rejects(runtime.run(), code("RUNTIME_BUSY")),
    ]);
    for (const runtime of [root, child]) {
      assert.throws(() => runtime.setFields({ count: 9 }), code("RUNTIME_BUSY"));
      assert.throws(() => runtime.reset(), code("RUNTIME_BUSY"));
      assert.equal(runtime.getStack().length, 2);
    }
    await Promise.all([pending, ...rejected]);
    assert.equal(root.getState().busy, false);
    assert.equal(child.getState().busy, false);
    assert.equal((await root.run()).output.count, 3);
  }
});

test("reset invalidates live and completed child instances without reusing invocation IDs", async () => {
  const root = createRuntime(graph(parent(), [increment()]), {}, {});
  const stack = root.getStack();
  await root.step();
  const completed = stack.at(-1);
  await completed.run();
  const oldRootId = root.invocationId;
  root.reset();
  assert.notEqual(root.invocationId, oldRootId);
  assert.equal(completed.getState().status, "invalidated");
  await root.step();
  const active = stack.at(-1);
  assert.notEqual(active.invocationId, completed.invocationId);
  assert.throws(() => root.reset({ unknown: 1 }), code("UNKNOWN_FIELD"));
  assert.equal(active.getState().status, "ready");
  const state = active.getState();
  root.reset();
  assert.equal(state.status, "invalidated");
  assert.deepEqual(stack, [root]);
  for (const stale of [completed, active]) {
    await assert.rejects(stale.step(), code("RUNTIME_INVALIDATED"));
    await assert.rejects(stale.run(), code("RUNTIME_INVALIDATED"));
    assert.throws(() => stale.setFields({ count: 1 }), code("RUNTIME_INVALIDATED"));
    assert.throws(() => stale.reset(), code("RUNTIME_INVALIDATED"));
    assert.throws(() => stale.getStack(), code("RUNTIME_INVALIDATED"));
  }
  assert.equal(root.getState().status, "ready");
});

test("deep failures preserve the stack and never write pending outputs", async () => {
  const bad = flow(
    "bad",
    [add(), { type: "divide", left: "$count", right: "$zero", output: "$count" }],
    { ...fields(), zero: { initial: 0 } },
  );
  const middle = flow("middle", [call("bad", { outputs: { count: "$count" } })], fields());
  const root = createRuntime(
    graph(flow("root", [call("middle", { outputs: { count: "$count" } })], fields()), [
      middle,
      bad,
    ]),
    { count: 99 },
    {},
  );
  const state = await root.run();
  const stack = root.getStack();
  assert.equal(stack.length, 3);
  assert.ok(stack.every((runtime) => runtime.getState().status === "failed"));
  assert.equal(state.fields.count, 99);
  assert.equal(stack[1].getState().fields.count, 0);
  assert.equal(stack[2].getState().fields.count, 1);
  assert.equal(state.error.flowName, "bad");
  assert.equal(state.error.invocationId, stack[2].invocationId);
  assert.equal(state.error.code, "DIVISION_BY_ZERO");
  assert.deepEqual(
    state.error.callStack.map(({ flowName, path }) => ({ flowName, path })),
    [
      { flowName: "root", path: "steps[0]" },
      { flowName: "middle", path: "steps[0]" },
      { flowName: "bad", path: "steps[1]" },
    ],
  );
  assert.equal((await stack[1].step()).event, null);
  assert.equal((await stack[2].run()).status, "failed");
  assert.throws(() => stack[1].setFields({ count: 1 }), code("RUNTIME_FINISHED"));
  root.reset();
  assert.equal(state.error, undefined);
  assert.equal(stack.length, 1);
});

test("stack limit includes root, permits exact depth, and bounds cyclic calls", async () => {
  const self = flow("self", [call("self")]);
  const recursive = createRuntime(graph(self), {}, { maxCallDepth: 3 });
  assert.equal((await recursive.run()).error.code, "CALL_DEPTH_LIMIT");
  assert.equal(recursive.getStack().length, 3);
  assert.equal(new Set(recursive.getStack().map((runtime) => runtime.invocationId)).size, 3);
  const a = flow("a", [call("b")]);
  const b = flow("b", [call("a")]);
  const cycle = createRuntime(graph(a, [b]), {}, { maxCallDepth: 4 });
  assert.equal((await cycle.run()).error.code, "CALL_DEPTH_LIMIT");
  assert.equal(cycle.getStack().length, 4);
  const exact = createRuntime(graph(a, [flow("b")]), {}, { maxCallDepth: 2 });
  assert.equal((await exact.run()).status, "completed");
  const forbidden = createRuntime(graph(a, [flow("b")]), {}, { maxCallDepth: 1 });
  assert.equal((await forbidden.run()).error.code, "CALL_DEPTH_LIMIT");
  assert.equal(forbidden.getStack().length, 1);
  const defaults = createRuntime(graph(self));
  await defaults.run();
  assert.equal(defaults.getStack().length, 32);
});

test("repeated calls inside loops get fresh state and distinct IDs; control frames are not call depth", async () => {
  const once = flow("once", [add()], fields());
  const root = createRuntime(
    graph(
      flow(
        "root",
        [
          {
            type: "while",
            condition: "$count",
            body: [
              {
                type: "if",
                condition: "$count",
                then: [call("once", { outputs: { count: "$result" } })],
              },
              { type: "subtract", left: "$count", right: "$one", output: "$count" },
            ],
          },
        ],
        { ...fields(), count: { initial: 2 }, result: { output: true } },
      ),
      [once],
    ),
    {},
    { maxCallDepth: 2 },
  );
  const ids = [];
  while (root.getState().status !== "completed") {
    const { event } = await root.step();
    if (event?.childInvocationId) ids.push(event.childInvocationId);
  }
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(root.getState().output.result, 1);
});

test("registrations and mapping errors are rejected at creation, including unused branches", () => {
  const child = increment();
  const invalid = [
    call("missing"),
    call("increment", { inputs: { unknown: "$parentField" } }),
    call("increment", { inputs: { one: "$parentField" } }),
    call("increment", { output: "$x", outputs: { count: "$y" } }),
    call("increment", { inputs: { count: "$broken[" } }),
    { type: "call", target: { kind: "script", id: "increment" } },
  ];
  for (const step of invalid) {
    assert.throws(
      () =>
        createRuntime(
          graph(flow("root", [{ type: "if", condition: "$never", then: [step] }]), [child]),
          {},
          {},
        ),
      code("INVALID_FLOW"),
    );
  }
  const two = flow("two", [], { a: { output: true }, b: { output: true } });
  assert.throws(
    () =>
      createRuntime(
        graph(flow("root", [call("two", { outputs: { a: "$same", b: "$same" } })]), [two]),
        {},
        {},
      ),
    code("INVALID_FLOW"),
  );

  for (const maxCallDepth of [0, -1, 1.5, null, "2", Infinity]) {
    assert.throws(() => createRuntime(flow("root"), {}, { maxCallDepth }), code("INVALID_OPTIONS"));
  }
  assert.throws(() => createRuntime(flow("root"), {}, { flows: {} }), code("INVALID_OPTIONS"));
});

test("only parent mapping values are collected; child parameter names do not leak into parent", async () => {
  const child = flow("child", [{ type: "set", field: "$childOutput", value: "$childInput" }], {
    childInput: { input: true },
    childOutput: { output: true },
  });
  const root = createRuntime(
    graph(
      flow("root", [
        call("child", {
          inputs: { childInput: "$source" },
          outputs: { childOutput: "$destination" },
        }),
      ]),
      [child],
    ),
    {},
    {},
  );
  assert.deepEqual(root.getState().fields, { source: undefined, destination: undefined });
  root.setFields({ source: 7 });
  await root.run();
  assert.deepEqual(root.getState().fields, { source: 7, destination: 7 });
});

test("special names in registration and mappings remain plain data", async () => {
  const child = flow("__proto__", [], JSON.parse('{"__proto__":{"input":true,"output":true}}'));
  const root = createRuntime(
    graph(
      flow(
        "root",
        [
          call("__proto__", {
            inputs: JSON.parse('{"__proto__":"$source"}'),
            outputs: JSON.parse('{"__proto__":"$result"}'),
          }),
        ],
        { source: { initial: 5 }, result: { output: true } },
      ),
      [child],
    ),
    {},
    {},
  );
  assert.deepEqual((await root.run()).output, { result: 5 });
  assert.equal(Object.getPrototypeOf(root.getState().fields), Object.prototype);
});

test("independent roots run concurrently and registry changes cannot change prepared definitions", async () => {
  const child = increment();
  const registry = [child];
  const a = createRuntime(graph(parent(), registry), {}, {});
  const b = createRuntime(graph(parent(), registry), { count: 10 }, {});
  child.fields.one.initial = 100;
  registry.length = 0;
  const [first, second] = await Promise.all([a.run(), b.run()]);
  assert.equal(first.output.count, 3);
  assert.equal(second.output.count, 13);
  assert.notEqual(a.invocationId, b.invocationId);
});
