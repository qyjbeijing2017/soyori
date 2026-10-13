import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime, inspectFlow, parseFlow } from "../dist/index.js";

const definition = (steps = [], fields = {}) => ({
  schemaVersion: 1,
  name: "Same name",
  fields,
  steps,
});
const loaded = (steps = [], fields = {}, source = "memory:flow") => ({
  definition: definition(steps, fields),
  imports: new Map(),
  source,
});
const call = (key, output = "result") => ({
  type: "call",
  target: key,
  output: `$${output}`,
});

test("identical names and aliases resolve within each importing flow", async () => {
  const root = loaded([call("left", "a"), call("right", "b")], {
    a: { output: true },
    b: { output: true },
  });
  const left = loaded([call("helper")], { result: { output: true } });
  const right = loaded([call("helper")], { result: { output: true } });
  left.imports.set("helper", loaded([], { value: { initial: 1, output: true } }));
  right.imports.set("helper", loaded([], { value: { initial: 2, output: true } }));
  root.imports.set("left", left).set("right", right);
  assert.deepEqual((await createRuntime(root).run()).output, {
    a: { result: { value: 1 } },
    b: { result: { value: 2 } },
  });
});

test("linked graph is captured once, including maps, definitions and diagnostic source", async () => {
  const child = loaded([], { value: { initial: 7, output: true } }, "memory:child");
  const root = loaded([call("child")], { result: { output: true } }, "memory:root");
  root.imports.set("child", child);
  const runtime = createRuntime(root);
  child.definition.fields.value.initial = 99;
  root.imports.clear();
  root.source = "changed";
  const { event } = await runtime.step();
  assert.equal(event.source, "memory:root");
  assert.equal(runtime.source, "memory:root");
  assert.deepEqual(runtime.getState().output, { result: { value: 7 } });
});

test("shared definitions and cyclic references require no global identifier", async () => {
  const root = loaded([call("self")]);
  root.imports.set("self", root);
  const runtime = createRuntime(root, {}, { maxCallDepth: 2 });
  const state = await runtime.run();
  assert.equal(state.error.code, "CALL_DEPTH_LIMIT");
  assert.equal(state.error.source, "memory:flow");
  assert.equal(state.error.callStack.length, 2);
  assert.notEqual(state.error.callStack[0].invocationId, state.error.callStack[1].invocationId);
});

test("missing declared imports and invalid unused dependencies fail before execution", () => {
  const root = loaded();
  root.definition.imports = { unused: "./missing.yaml" };
  assert.throws(
    () => createRuntime(root),
    (e) => e.code === "INVALID_FLOW" && e.path === "imports.unused" && e.source === "memory:flow",
  );
  root.imports.set("unused", loaded([call("missing")], {}, "memory:bad"));
  assert.throws(
    () => createRuntime(root),
    (e) => e.code === "INVALID_FLOW" && e.source === "memory:bad",
  );
  assert.throws(() => createRuntime({ definition: definition(), imports: {} }), /Map/);
});

test("distribution schema describes aliases and rejects obsolete identities", () => {
  const flow = { ...definition([call("child")]), imports: { child: "./child.yaml" } };
  const info = inspectFlow(flow);
  assert.deepEqual(info.imports, { child: "./child.yaml" });
  assert.deepEqual(info.references, [{ target: "child", path: "steps[0]" }]);
  assert.throws(() => parseFlow({ ...flow, id: "obsolete" }), /Unknown property/);
  assert.throws(
    () => parseFlow(definition([{ type: "call", target: { kind: "flow", key: "old" } }])),
    /target/,
  );
  for (const imports of [{ child: "" }, { child: 1 }, { "": "./child" }, []]) {
    assert.throws(() => parseFlow({ ...flow, imports }), /imports/);
  }
});

test("unified targets reject ambiguous aliases before any function executes", async () => {
  let calls = 0;
  const root = loaded([{ type: "call", target: "work" }]);
  root.imports.set("work", loaded());
  assert.throws(
    () =>
      createRuntime(
        root,
        {},
        {
          functions: {
            work() {
              calls++;
            },
          },
        },
      ),
    /conflicts/,
  );
  assert.equal(calls, 0);
  root.definition.steps = [];
  assert.throws(() => createRuntime(root, {}, { functions: { work() {} } }), /conflicts/);
  const child = loaded();
  child.imports.set("work", loaded());
  root.imports.clear();
  root.imports.set("child", child);
  assert.throws(() => createRuntime(root, {}, { functions: { work() {} } }), /conflicts/);
  for (const target of ["", " ", 1, null, { kind: "flow", key: "child" }])
    assert.throws(() => parseFlow(definition([{ type: "call", target }])), /target/);
});
