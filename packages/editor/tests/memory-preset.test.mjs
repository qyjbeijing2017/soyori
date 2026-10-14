import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTools, createToolExecutionTools } from "soyori-ai";
import { createRuntime, parseFlow } from "soyori-core";
import { createStorageTools } from "soyori-storage";
import { createBasicTools } from "soyori-tools";
import example from "../src/example.json" with { type: "json" };

test("simple memory preset saves only successful replies and isolates threads", async () => {
  const data = new Map();
  const storage = {
    read: async (key) => ({ found: data.has(key), value: data.get(key) }),
    write: async (key, value) => {
      data.set(key, structuredClone(value));
      return { key };
    },
    delete: async (key) => ({ deleted: data.delete(key) }),
    list: async () => ({ keys: [...data.keys()] }),
  };
  let fail = false;
  const calls = [];
  const functions = {
    ...createStorageTools(storage),
    ...createMemoryTools(storage),
    ...createBasicTools(),
    "llm.auto": async ({ input }) => {
      calls.push(input);
      if (fail) throw Error("model failed");
      return { result: "hello", message: { role: "assistant", content: "hello" } };
    },
  };
  Object.assign(functions, createToolExecutionTools({ registry: () => functions }));
  const flow = parseFlow(example);
  assert.equal(flow.steps.length, 5);
  async function run(threadId, chatIn) {
    const r = createRuntime(flow, { threadId, chatIn }, { functions });
    await r.run();
    return r.getState();
  }
  assert.equal((await run("a", "first")).output.chatOut, "hello");
  await run("a", "second");
  assert.equal(calls[1].length, 4);
  assert.equal(calls[1][0].role, "system");
  assert.doesNotMatch(calls[1][0].content, /mwmbl|For news|time\.now|web\.search|web\.fetch/);
  assert.equal(calls[1].filter((m) => m.role === "system").length, 1);
  assert.equal(data.get("memory/a").length, 5);
  await run("b", "separate");
  assert.equal(calls[2].length, 2);
  const before = structuredClone(data.get("memory/a"));
  fail = true;
  assert.equal((await run("a", "failure")).status, "failed");
  assert.deepEqual(data.get("memory/a"), before);
});

test("default tool loop feeds mixed outcomes back to the model until its final reply", async () => {
  let saved;
  let rounds = 0;
  const storage = {
    read: async () => ({ found: false, value: null }),
    list: async () => ({ keys: ["demo"] }),
    write: async (_key, value) => {
      saved = structuredClone(value);
      return { key: "saved" };
    },
  };
  const functions = {
    ...createMemoryTools(storage),
    ...createBasicTools(),
    ...createStorageTools(storage),
    "llm.auto": async ({ input, tools }) => {
      assert.ok(tools.includes("time.now"));
      rounds++;
      let toolCalls;
      if (rounds === 1)
        toolCalls = [
          { id: "ok", target: "time.now", inputs: {} },
          { id: "fail", target: "web.fetch", inputs: { url: "ftp://invalid" } },
        ];
      else if (rounds === 2) {
        assert.match(JSON.parse(input.at(-2).content).iso, /^\d{4}-/);
        assert.ok(JSON.parse(input.at(-1).content).error);
        toolCalls = [{ id: "again", target: "time.now", inputs: {} }];
      } else {
        assert.equal(rounds, 3);
        assert.equal(input.at(-1).toolCallId, "again");
        toolCalls = [];
      }
      const result = rounds === 3 ? "done" : "";
      return {
        result,
        toolCalls,
        message: { role: "assistant", content: result, ...(toolCalls.length ? { toolCalls } : {}) },
      };
    },
  };
  Object.assign(functions, createToolExecutionTools({ registry: () => functions }));
  const runtime = createRuntime(
    parseFlow(example),
    { threadId: "test", chatIn: "check" },
    { functions },
  );
  await runtime.run();
  assert.equal(runtime.getState().status, "completed");
  assert.equal(runtime.getState().output.chatOut, "done");
  assert.equal(rounds, 3);
  assert.equal(saved.length, 8);
  assert.equal(saved.at(-1).content, "done");
  assert.equal(
    Object.values(example.fields).some((f) => f.type === "group"),
    false,
  );
});

test("default preset keeps only necessary state and reads calls from the assistant message", () => {
  assert.deepEqual(Object.keys(example.fields), [
    "chatIn",
    "threadId",
    "chatOut",
    "memory",
    "assistantMessage",
    "toolResults",
  ]);
  const first = example.steps.find((s) => s.target === "llm.auto");
  const loop = example.steps.find((s) => s.type === "while");
  assert.deepEqual(first.inputs.tools, ["time.now", "web.search", "web.fetch"]);
  assert.deepEqual(loop.body.find((s) => s.target === "llm.auto").inputs.tools, first.inputs.tools);
  assert.equal(loop.condition, "$assistantMessage.toolCalls.length");
  assert.equal(loop.body[0].inputs.calls, "$assistantMessage.toolCalls");
});
