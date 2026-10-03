import assert from "node:assert/strict";
import test from "node:test";
import { stringify } from "yaml";
import { newThread, readThreadBook, threadFlow } from "../src/chat-threads.ts";
import { readFlowFile } from "../src/flow-files.ts";
import { createSession } from "../src/session.ts";

test("thread memory is isolated while the original flow stays unchanged", async () => {
  const flow = {
    schemaVersion: 1,
    name: "test",
    fields: { memoryKey: { initial: "shared" }, answer: { output: true } },
    steps: [{ type: "set", field: "$answer", value: "$memoryKey" }],
  };
  const a = newThread("agent"),
    b = newThread("agent");
  assert.notEqual(a.memoryKey, b.memoryKey);
  for (const thread of [a, b]) {
    const session = createSession(threadFlow(flow, thread), {});
    await session.runtime.run();
    assert.equal(session.runtime.getState().output.answer, thread.memoryKey);
  }
  assert.equal(flow.fields.memoryKey.initial, "shared");
  assert.deepEqual(readFlowFile(stringify(flow), "flow.yaml"), flow);
});
test("thread records preserve selection and reject broken records", () => {
  const a = newThread("agent"),
    b = newThread("agent");
  a.messages.push({ role: "user", content: "第一轮" });
  const book = { activeId: b.id, threads: [b, a] };
  assert.deepEqual(readThreadBook(JSON.parse(JSON.stringify(book))), book);
  assert.throws(() => readThreadBook({ ...book, activeId: "missing" }));
  assert.throws(() => readThreadBook({ activeId: a.id, threads: [a, a] }));
});

test("deleting conversations preserves other history and persists an empty book", async () => {
  const { removeThread } = await import("../src/chat-threads.ts");
  const first = newThread("flow"),
    second = newThread("flow");
  const book = { activeId: first.id, threads: [first, second] };
  const removed = removeThread(book, first.id);
  assert.equal(removed.activeId, second.id);
  assert.deepEqual(removed.threads, [second]);
  assert.equal(book.threads.length, 2);
  const last = removeThread(removed, second.id);
  assert.deepEqual(last, { activeId: "", threads: [] });
  assert.deepEqual(readThreadBook(last), last);
});
