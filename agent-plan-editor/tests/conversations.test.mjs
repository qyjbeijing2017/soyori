import assert from "node:assert/strict";
import test from "node:test";
import { newThread, removeThread } from "../src/chat-threads.ts";
import { createConversationStore } from "../src/conversation-store.ts";

function memory() {
  const values = new Map(),
    writes = [];
  return {
    values,
    writes,
    async read(key) {
      return { found: values.has(key), value: structuredClone(values.get(key)) };
    },
    async write(key, value) {
      writes.push(key);
      values.set(key, structuredClone(value));
      return { key };
    },
    async delete(key) {
      return { deleted: values.delete(key) };
    },
    async list(prefix = "") {
      return { keys: [...values.keys()].filter((k) => k.startsWith(prefix)) };
    },
  };
}
test("raw threads use independent shared keys and reload through the UI index", async () => {
  const storage = memory(),
    indexes = memory(),
    repo = createConversationStore(storage, indexes);
  await indexes.write("threads/flow", { old: "ignored" });
  const book = await repo.load("flow");
  const a = book.threads[0],
    b = newThread("flow");
  assert.equal(a.flowId, "flow");
  assert.equal(a.memoryKey, undefined);
  assert.ok(storage.values.has(`threads/${a.id}`));
  book.threads.push(b);
  book.activeId = b.id;
  await repo.save("flow", book);
  storage.writes.length = 0;
  b.messages.push(
    { role: "user", content: "hello" },
    { role: "assistant", content: "- one", format: "yaml" },
  );
  await repo.save("flow", book);
  assert.deepEqual(storage.writes, [`threads/${b.id}`]);
  assert.deepEqual(await createConversationStore(storage, indexes).load("flow"), book);
  assert.ok(indexes.values.has("threads/flow"));
  await storage.write("custom/memory", { keep: true });
  await repo.save("flow", removeThread(book, a.id));
  assert.equal(storage.values.has(`threads/${a.id}`), false);
  await repo.save("flow", { activeId: "", threads: [] });
  assert.deepEqual(await createConversationStore(storage, indexes).load("flow"), {
    activeId: "",
    threads: [],
  });
  assert.deepEqual(storage.values.get("custom/memory"), { keep: true });
});
test("concurrent loads do not create duplicate initial threads and failed writes reject", async () => {
  const storage = memory(),
    indexes = memory(),
    repo = createConversationStore(storage, indexes);
  const [a, b] = await Promise.all([repo.load("flow"), repo.load("flow")]);
  assert.equal(a.activeId, b.activeId);
  a.threads[0].messages.push({ role: "user", content: "pending" });
  storage.write = async () => {
    throw Error("quota");
  };
  await assert.rejects(repo.save("flow", a), /quota/);
  const loaded = await createConversationStore(storage, indexes).load("flow");
  assert.equal(loaded.threads[0].messages.length, 0);
});
