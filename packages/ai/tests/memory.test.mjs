import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTools, parseInput } from "../dist/index.js";

const t = createMemoryTools();
test("memory tools expose one history name and reject the removed messages input", () => {
  for (const name of [
    "memory.setSystem",
    "memory.addUser",
    "memory.addAssistant",
    "memory.addTools",
  ]) {
    const definition = t[name].definition;
    assert.equal(definition.inputs[0].name, "memory");
    assert.equal(definition.inputs[0].initial, "$memory");
    assert.deepEqual(
      definition.outputs.map((output) => output.name),
      ["memory"],
    );
    assert.throws(
      () => t[name]({ messages: [{ role: "user", content: "keep me" }] }),
      /Use memory/,
    );
    assert.throws(() => t[name]({ memory: [], messages: [] }), /Use memory/);
  }
  assert.equal(
    t["memory.save"].definition.inputs.find((input) => input.name === "memory").initial,
    "$memory",
  );
  assert.equal(t["memory.addAssistant"].definition.inputs[1].initial, "$assistantMessage");
  assert.equal(t["memory.addTools"].definition.inputs[1].initial, "$toolResults");
  assert.deepEqual(Object.keys(t["memory.addUser"]({ input: "hello" })), ["memory"]);
});
test("memory init and save isolate prefixes and threads, replace system, and preserve stored history", async () => {
  const data = new Map();
  let writes = 0;
  const tools = createMemoryTools({
    read: async (key) => ({ found: data.has(key), value: data.get(key) }),
    write: async (key, value) => {
      writes++;
      data.set(key, structuredClone(value));
      return { key };
    },
  });
  const first = await tools["memory.init"]({ threadId: "a", system: "old", prompt: "hello" });
  assert.equal(data.size, 0);
  await tools["memory.save"]({ threadId: "a", memory: first.memory });
  const next = await tools["memory.init"]({
    prefix: "memory/",
    threadId: "a",
    system: "new",
    prompt: "next",
  });
  assert.deepEqual(next.memory, [
    { role: "system", content: "new" },
    { role: "user", content: "hello" },
    { role: "user", content: "next" },
  ]);
  assert.deepEqual(data.get("memory/a"), first.memory);
  assert.deepEqual((await tools["memory.init"]({ threadId: "a" })).memory, first.memory);
  assert.deepEqual((await tools["memory.init"]({ prefix: "other", threadId: "a" })).memory, []);
  assert.deepEqual((await tools["memory.init"]({ threadId: "b" })).memory, []);
  for (const input of [
    { threadId: "../bad" },
    { threadId: "a/b" },
    { threadId: "a", prefix: "../bad" },
    { threadId: "a", prompt: " " },
    { threadId: "a", system: null },
  ])
    await assert.rejects(tools["memory.init"](input));
  const pending = [
    { role: "assistant", content: "", toolCalls: [{ id: "a", target: "one", inputs: {} }] },
  ];
  await assert.rejects(tools["memory.save"]({ threadId: "a", memory: pending }), /pending/);
  await assert.rejects(tools["memory.save"]({ threadId: "a", memory: null }), /message array/);
  assert.equal(writes, 1);
  data.set("memory/b", { broken: true });
  await assert.rejects(tools["memory.init"]({ threadId: "b", prompt: "x" }), /message array/);
  const broken = createMemoryTools({
    read: async () => {
      throw Error("read failed");
    },
    write: async () => {
      throw Error("write failed");
    },
  });
  await assert.rejects(broken["memory.init"]({ threadId: "a" }), /read failed/);
  await assert.rejects(broken["memory.save"]({ threadId: "a", memory: [] }), /write failed/);
});
test("assembly preserves blocks and maps tool outcomes by ID without mutating history", () => {
  const original = t["memory.addUser"]({ input: "hello" }).memory;
  const message = {
    role: "assistant",
    content: [{ type: "text", text: "checking" }],
    toolCalls: [
      { id: "a", target: "one", inputs: {} },
      { id: "b", target: "two", inputs: {} },
    ],
  };
  const pending = t["memory.addAssistant"]({ memory: original, message }).memory;
  const done = t["memory.addTools"]({
    memory: pending,
    results: [
      { id: "b", target: "two", error: { message: "failed" } },
      { id: "a", target: "one", result: { value: 2 } },
    ],
  }).memory;
  assert.deepEqual(original, [{ role: "user", content: "hello" }]);
  assert.equal(pending.length, 2);
  assert.deepEqual(done[1], message);
  assert.deepEqual(done.slice(2), [
    { role: "tool", toolCallId: "a", content: '{"value":2}' },
    { role: "tool", toolCallId: "b", content: '{"error":{"message":"failed"}}' },
  ]);
  assert.deepEqual(parseInput({ input: done }).messages, done);
  assert.equal(t["memory.addUser"]({ memory: done, input: "next" }).memory.length, 5);
});
test("assembly rejects mismatched results and memory while tools are pending", () => {
  const memory = [
    { role: "assistant", content: "", toolCalls: [{ id: "a", target: "one", inputs: {} }] },
  ];
  assert.throws(() => t["memory.addUser"]({ memory, input: "x" }), /pending/);
  assert.throws(
    () => t["memory.addAssistant"]({ memory, message: { role: "assistant", content: "x" } }),
    /pending/,
  );
  for (const results of [
    [],
    [{ id: "b", target: "one", result: 1 }],
    [{ id: "a", target: "wrong", result: 1 }],
    [{ id: "a", target: "one", result: 1, error: { message: "x" } }],
  ])
    assert.throws(() => t["memory.addTools"]({ memory, results }), /MEMORY_INPUT/);
  assert.throws(
    () =>
      t["memory.addUser"]({
        memory: [{ role: "tool", toolCallId: "a", content: "x" }],
        input: "x",
      }),
    /pending/,
  );
  assert.throws(
    () => t["memory.addAssistant"]({ message: { role: "user", content: "x" } }),
    /assistant/,
  );
  assert.throws(() => t["memory.addUser"]({ input: " " }), /nonempty/);
  assert.throws(() => t["memory.addUser"]({ memory: { version: 1 }, input: "x" }), /message array/);
  assert.deepEqual(t["memory.addTools"]({ results: [] }).memory, []);
});

test("setSystem replaces system prompts at the front without altering conversation or pending calls", () => {
  const source = [
    { role: "system", content: "old" },
    { role: "user", content: "hello" },
    { role: "system", content: "another" },
    { role: "assistant", content: "", toolCalls: [{ id: "a", target: "one", inputs: {} }] },
  ];
  const updated = t["memory.setSystem"]({ memory: source, text: "  new prompt  " }).memory;
  assert.deepEqual(updated, [{ role: "system", content: "  new prompt  " }, source[1], source[3]]);
  assert.equal(source.length, 4);
  assert.equal(source[0].content, "old");
  assert.deepEqual(
    t["memory.setSystem"]({ memory: updated, text: "  new prompt  " }).memory,
    updated,
  );
  assert.equal(
    t["memory.addTools"]({ memory: updated, results: [{ id: "a", target: "one", result: 1 }] })
      .memory.length,
    4,
  );
  for (const memory of [undefined, null, []])
    assert.deepEqual(t["memory.setSystem"]({ memory, text: "new" }).memory, [
      { role: "system", content: "new" },
    ]);
  for (const text of [undefined, null, 1, "", "  "])
    assert.throws(() => t["memory.setSystem"]({ text }), /MEMORY_INPUT/);
  assert.throws(
    () =>
      t["memory.setSystem"]({
        memory: [{ role: "tool", content: "orphan", toolCallId: "a" }],
        text: "new",
      }),
    /pending/,
  );
  assert.equal(t["memory.setSystem"].definition.name, "memory.setSystem");
});
