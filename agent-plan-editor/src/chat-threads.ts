import type { FlowDefinition } from "agent-plan-core";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  format?: "yaml";
}
export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  memoryKey: string;
}
export interface ThreadBook {
  activeId: string;
  threads: ChatThread[];
}
export function newThread(docId: string): ChatThread {
  const id = crypto.randomUUID();
  return { id, title: "新对话", messages: [], memoryKey: `editor/threads/${docId}/${id}/memory` };
}
export function threadFlow(flow: FlowDefinition, thread: ChatThread): FlowDefinition {
  return {
    ...flow,
    fields: {
      ...flow.fields,
      chatIn: { ...flow.fields.chatIn, input: true },
      memoryKey: { ...flow.fields.memoryKey, input: true, initial: thread.memoryKey },
    },
  };
}
export function validMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string" &&
        (m.format === undefined || m.format === "yaml"),
    )
  );
}
export function readThreadBook(value: unknown): ThreadBook {
  const book = value as ThreadBook;
  if (
    !book ||
    !Array.isArray(book.threads) ||
    !book.threads.every(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        typeof t.memoryKey === "string" &&
        validMessages(t.messages),
    ) ||
    new Set(book.threads.map((t) => t.id)).size !== book.threads.length ||
    (book.threads.length ? !book.threads.some((t) => t.id === book.activeId) : book.activeId !== "")
  )
    throw Error("会话记录损坏，无法读取。");
  return book;
}

export function removeThread(book: ThreadBook, id: string): ThreadBook {
  if (!book.threads.some((thread) => thread.id === id)) return book;
  const threads = book.threads.filter((thread) => thread.id !== id);
  return {
    threads,
    activeId: threads.some((thread) => thread.id === book.activeId)
      ? book.activeId
      : (threads[0]?.id ?? ""),
  };
}
