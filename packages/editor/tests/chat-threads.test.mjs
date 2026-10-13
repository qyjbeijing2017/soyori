import assert from "node:assert/strict";
import test from "node:test";
import { stringify } from "yaml";
import { newThread, readThreadBook, threadFlow } from "../src/chat-threads.ts";
import { readFlowFile } from "../src/flow-files.ts";
import { createSession } from "../src/session.ts";

test("thread IDs are isolated while the original flow stays unchanged", async () => {
  const flow = {
    schemaVersion: 1,
    name: "test",
    fields: { threadId: { initial: "shared" }, answer: { output: true } },
    steps: [{ type: "set", field: "$answer", value: "$threadId" }],
  };
  const a = newThread("agent"),
    b = newThread("agent");
  assert.notEqual(a.id, b.id);
  for (const thread of [a, b]) {
    const session = createSession(threadFlow(flow, thread), {});
    await session.runtime.run();
    assert.equal(session.runtime.getState().output.answer, thread.id);
  }
  assert.equal(flow.fields.threadId.initial, "shared");
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

test("YAML message display metadata persists and legacy Markdown messages remain valid", () => {
  const thread = newThread("agent");
  thread.messages = [
    { role: "user", content: "**hello**" },
    { role: "assistant", content: "- one\n- two", format: "yaml" },
  ];
  const book = { activeId: thread.id, threads: [thread] };
  assert.deepEqual(readThreadBook(JSON.parse(JSON.stringify(book))), book);
  thread.messages[1].format = "html";
  assert.throws(() => readThreadBook(book));
});

test("a background reply preserves a new draft, other deletions, and the selected conversation", async () => {
  const { updateThread, removeThread } = await import("../src/chat-threads.ts");
  const running = newThread("agent"),
    other = newThread("agent"),
    deleted = newThread("agent");
  const original = { activeId: running.id, threads: [running, other, deleted] };
  const reply = { ...running, messages: [{ role: "assistant", content: "finished" }] };
  const switched = removeThread({ ...original, activeId: other.id }, deleted.id);
  const completed = updateThread(switched, reply);
  assert.equal(completed.activeId, other.id);
  assert.deepEqual(
    completed.threads.map((t) => t.id),
    [running.id, other.id],
  );
  assert.equal(completed.threads[0].messages[0].content, "finished");
  assert.equal(updateThread({ ...switched, activeId: "" }, reply).activeId, "");
  const removedRunning = removeThread(switched, running.id);
  assert.equal(updateThread(removedRunning, reply), removedRunning);
  const draft = newThread("agent");
  const created = updateThread(switched, draft, true);
  assert.equal(created.activeId, draft.id);
  assert.equal(created.threads[0], draft);
  assert.equal(original.threads[0].messages.length, 0);
});
