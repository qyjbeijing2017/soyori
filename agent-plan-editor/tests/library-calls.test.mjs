import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime } from "agent-plan-core";
import {
  bindLibraryCalls,
  libraryChoices,
  loadLibraryGraph,
  migrateCallTargets,
} from "../src/library-calls.ts";
import { createSession } from "../src/session.ts";

const doc = (id, name, steps = [], fields = {}) => ({
  id,
  updatedAt: "",
  flow: { schemaVersion: 1, name, fields, steps },
});

test("model and executor tool lists bind imported Library flows including variable defaults", () => {
  const child = doc("tool-id", "my.lookup");
  for (const value of [["my.lookup"], "$tools"]) {
    const root = doc(
      "root",
      "root",
      [{ type: "call", target: "llm.local", inputs: { input: "hi", tools: value } }],
      { tools: { initial: ["my.lookup"] } },
    );
    const bound = bindLibraryCalls(root.flow, libraryChoices(root.flow, [child]));
    assert.equal(bound.imports["my.lookup"], "library:tool-id");
    assert.equal(root.flow.imports, undefined);
  }
});

test("Library choices bind stable imports, survive renames and run through Core", async () => {
  const child = doc(
    "child-id",
    "Add one",
    [{ type: "add", left: "$count", right: 1, output: "$count" }],
    { count: { input: true, output: true, initial: 3 } },
  );
  const root = doc(
    "root-id",
    "Parent",
    [{ type: "call", target: "Add one", inputs: { count: 5 }, outputs: { count: "$answer" } }],
    { answer: { output: true } },
  );
  root.flow = bindLibraryCalls(root.flow, libraryChoices(root.flow, [root, child]));
  assert.equal(root.flow.imports["Add one"], "library:child-id");
  child.flow.name = "Renamed";
  const session = createSession(loadLibraryGraph(root, [child]), {});
  await session.step();
  assert.equal(session.runtime.getState().status, "waiting");
  assert.equal(session.records.length, 0);
  await session.step();
  assert.equal(session.runtime.getState().output.answer, 6);
  assert.equal(session.records.length, 1);
  assert.equal(session.records[0].path, "steps[0]");
  assert.equal(JSON.parse(session.records[0].after).answer, 6);
  assert.throws(() => loadLibraryGraph(root, []), /child-id/);
  const renamedChoice = libraryChoices(root.flow, [child])[0];
  assert.equal(renamedChoice.alias, "Add one");
  assert.match(renamedChoice.label, /Renamed/);
});

test("duplicate labels stay unambiguous, external dependencies fail, cycles use Core limits", async () => {
  const a = doc("a", "Same"),
    b = doc("b", "Same"),
    reserved = doc("x", "storage.read");
  assert.deepEqual(
    libraryChoices(a.flow, [a, b, reserved]).map((c) => c.alias),
    ["Same", "Same (2)"],
  );
  a.flow.imports = { recurse: "library:a" };
  a.flow.steps = [{ type: "call", target: "recurse" }];
  assert.equal(
    (await createRuntime(loadLibraryGraph(a, []), {}, { maxCallDepth: 2 }).run()).error.code,
    "CALL_DEPTH_LIMIT",
  );
  a.flow.imports = { external: "./child.json" };
  assert.throws(() => loadLibraryGraph(a, []), /child.json/);
});

test("persisted legacy targets migrate recursively without mutating source", () => {
  const old = doc("old", "Old", [
    {
      type: "if",
      condition: true,
      then: [{ type: "call", target: { kind: "function", id: "storage.list" } }],
    },
  ]).flow;
  const migrated = migrateCallTargets(old);
  assert.equal(migrated.steps[0].then[0].target, "storage.list");
  assert.equal(old.steps[0].then[0].target.kind, "function");
  assert.equal(migrateCallTargets(migrated), migrated);
});

test("child parameter defaults preserve literal dollar strings and null", async () => {
  const { defaultOperand } = await import("../src/library-calls.ts");
  const value = { text: "$literal", nested: ["$$escaped", null] };
  const runtime = createRuntime(
    {
      schemaVersion: 1,
      name: "default",
      fields: { result: { output: true } },
      steps: [
        {
          type: "call",
          target: "echo",
          inputs: { value: defaultOperand(value) },
          output: "$result",
        },
      ],
    },
    {},
    { functions: { echo: ({ value }) => value } },
  );
  assert.deepEqual((await runtime.run()).output.result, value);
});
