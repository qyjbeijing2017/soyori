import type { Storage } from "agent-plan-storage";
import { type ChatThread, readThreadBook, type ThreadBook } from "./chat-threads.ts";

interface ThreadIndex {
  activeId: string;
  threadIds: string[];
}
function readIndex(value: unknown): ThreadIndex {
  const index = value as ThreadIndex;
  if (
    !index ||
    typeof index.activeId !== "string" ||
    !Array.isArray(index.threadIds) ||
    !index.threadIds.every((id) => typeof id === "string") ||
    new Set(index.threadIds).size !== index.threadIds.length ||
    (index.activeId !== "" && !index.threadIds.includes(index.activeId))
  )
    throw Error("Invalid conversation index");
  return index;
}

/** Raw transcripts are shared tool storage; only UI selection/order stays in a separate index. */
export function createConversationStore(
  storage: Storage,
  indexes: Storage,
  environmentStorage?: Storage,
) {
  const snapshots = new Map<string, string>();
  let queue = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const job = queue.then(task);
    queue = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  async function save(docId: string, book: ThreadBook) {
    readThreadBook(book);
    if (book.threads.some((t) => t.flowId !== docId)) throw Error("Thread belongs to another flow");
    const saved = await indexes.read(`thread-index/${docId}`);
    const old = saved.found ? readIndex(saved.value) : { activeId: "", threadIds: [] };
    for (const thread of book.threads) {
      const text = JSON.stringify(thread);
      if (snapshots.get(thread.id) !== text) {
        const prior = await storage.read(`threads/${thread.id}`);
        if (prior.found && (prior.value as ChatThread)?.flowId !== docId)
          throw Error("Thread ID already exists");
        await storage.write(`threads/${thread.id}`, thread);
        snapshots.set(thread.id, text);
      }
    }
    for (const id of old.threadIds.filter((id) => !book.threads.some((t) => t.id === id))) {
      await storage.delete(`threads/${id}`);
      await environmentStorage?.delete(`env/threads/${id}`);
      snapshots.delete(id);
    }
    await indexes.write(`thread-index/${docId}`, {
      activeId: book.activeId,
      threadIds: book.threads.map((t) => t.id),
    });
  }
  return {
    save: (docId: string, book: ThreadBook) => serial(() => save(docId, book)),
    load: (docId: string) =>
      serial(async (): Promise<ThreadBook> => {
        const saved = await indexes.read(`thread-index/${docId}`);
        if (!saved.found) return { activeId: "", threads: [] };
        const index = readIndex(saved.value);
        const threads: ChatThread[] = [];
        for (const id of index.threadIds) {
          const record = await storage.read(`threads/${id}`);
          if (!record.found) continue;
          const thread = record.value as ChatThread;
          if (thread?.id !== id || thread.flowId !== docId) throw Error("Invalid thread record");
          readThreadBook({ activeId: id, threads: [thread] });
          threads.push(thread);
          snapshots.set(id, JSON.stringify(thread));
        }
        return {
          activeId:
            index.activeId === "" || threads.some((t) => t.id === index.activeId)
              ? index.activeId
              : (threads[0]?.id ?? ""),
          threads,
        };
      }),
  };
}
