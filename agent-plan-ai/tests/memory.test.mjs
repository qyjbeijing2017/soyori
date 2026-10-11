import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTools, parseInput } from "../dist/index.js";

const t = createMemoryTools();
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
  const original = t["memory.addUser"]({ input: "hello" }).messages;
  const message = {
    role: "assistant",
    content: [{ type: "text", text: "checking" }],
    toolCalls: [
      { id: "a", target: "one", inputs: {} },
      { id: "b", target: "two", inputs: {} },
    ],
  };
  const pending = t["memory.addAssistant"]({ messages: original, message }).messages;
  const done = t["memory.addTools"]({
    messages: pending,
    results: [
      { id: "b", target: "two", error: { message: "failed" } },
      { id: "a", target: "one", result: { value: 2 } },
    ],
  }).messages;
  assert.deepEqual(original, [{ role: "user", content: "hello" }]);
  assert.equal(pending.length, 2);
  assert.deepEqual(done[1], message);
  assert.deepEqual(done.slice(2), [
    { role: "tool", toolCallId: "a", content: '{"value":2}' },
    { role: "tool", toolCallId: "b", content: '{"error":{"message":"failed"}}' },
  ]);
  assert.deepEqual(parseInput({ input: done }).messages, done);
  assert.equal(t["memory.addUser"]({ messages: done, input: "next" }).messages.length, 5);
});
test("assembly rejects mismatched results and messages while tools are pending", () => {
  const messages = [
    { role: "assistant", content: "", toolCalls: [{ id: "a", target: "one", inputs: {} }] },
  ];
  assert.throws(() => t["memory.addUser"]({ messages, input: "x" }), /pending/);
  assert.throws(
    () => t["memory.addAssistant"]({ messages, message: { role: "assistant", content: "x" } }),
    /pending/,
  );
  for (const results of [
    [],
    [{ id: "b", target: "one", result: 1 }],
    [{ id: "a", target: "wrong", result: 1 }],
    [{ id: "a", target: "one", result: 1, error: { message: "x" } }],
  ])
    assert.throws(() => t["memory.addTools"]({ messages, results }), /MEMORY_INPUT/);
  assert.throws(
    () =>
      t["memory.addUser"]({
        messages: [{ role: "tool", toolCallId: "a", content: "x" }],
        input: "x",
      }),
    /pending/,
  );
  assert.throws(
    () => t["memory.addAssistant"]({ message: { role: "user", content: "x" } }),
    /assistant/,
  );
  assert.throws(() => t["memory.addUser"]({ input: " " }), /nonempty/);
  assert.throws(
    () => t["memory.addUser"]({ messages: { version: 1 }, input: "x" }),
    /message array/,
  );
  assert.deepEqual(t["memory.addTools"]({ results: [] }).messages, []);
});

test("setSystem replaces system prompts at the front without altering conversation or pending calls", () => {
  const source = [
    { role: "system", content: "old" },
    { role: "user", content: "hello" },
    { role: "system", content: "another" },
    { role: "assistant", content: "", toolCalls: [{ id: "a", target: "one", inputs: {} }] },
  ];
  const updated = t["memory.setSystem"]({ messages: source, text: "  new prompt  " }).messages;
  assert.deepEqual(updated, [{ role: "system", content: "  new prompt  " }, source[1], source[3]]);
  assert.equal(source.length, 4);
  assert.equal(source[0].content, "old");
  assert.deepEqual(
    t["memory.setSystem"]({ messages: updated, text: "  new prompt  " }).messages,
    updated,
  );
  assert.equal(
    t["memory.addTools"]({ messages: updated, results: [{ id: "a", target: "one", result: 1 }] })
      .messages.length,
    4,
  );
  for (const messages of [undefined, null, []])
    assert.deepEqual(t["memory.setSystem"]({ messages, text: "new" }).messages, [
      { role: "system", content: "new" },
    ]);
  for (const text of [undefined, null, 1, "", "  "])
    assert.throws(() => t["memory.setSystem"]({ text }), /MEMORY_INPUT/);
  assert.throws(
    () =>
      t["memory.setSystem"]({
        messages: [{ role: "tool", content: "orphan", toolCallId: "a" }],
        text: "new",
      }),
    /pending/,
  );
  assert.equal(t["memory.setSystem"].definition.name, "memory.setSystem");
});
