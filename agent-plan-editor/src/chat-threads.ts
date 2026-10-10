import type { FlowDefinition } from "agent-plan-core";
import { fieldDefinitions, withFieldDefinitions } from "agent-plan-core";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  format?: "yaml";
}
export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  flowId: string;
}
export interface ThreadBook {
  activeId: string;
  threads: ChatThread[];
}
export function newThread(docId: string): ChatThread {
  const id = crypto.randomUUID();
  return { id, title: "新对话", messages: [], flowId: docId };
}
/** Allocate a thread only when sending; an empty activeId represents a new-chat draft. */
export function prepareThreadForSend(book: ThreadBook, docId: string) {
  const active = book.threads.find((thread) => thread.id === book.activeId);
  if (active) return { thread: active, book };
  const thread = newThread(docId);
  return { thread, book: { activeId: thread.id, threads: [thread, ...book.threads] } };
}
export function threadFlow(flow: FlowDefinition, thread: ChatThread): FlowDefinition {
  return {
    ...flow,
    fields: withFieldDefinitions(flow.fields, {
      ...fieldDefinitions(flow.fields),
      chatIn: { ...fieldDefinitions(flow.fields).chatIn, input: true },
      threadId: { ...fieldDefinitions(flow.fields).threadId, input: true, initial: thread.id },
    }),
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
        typeof t.flowId === "string" &&
        validMessages(t.messages),
    ) ||
    new Set(book.threads.map((t) => t.id)).size !== book.threads.length ||
    typeof book.activeId !== "string" ||
    (book.activeId !== "" && !book.threads.some((t) => t.id === book.activeId))
  )
    throw Error("会话记录损坏，无法读取。");
  return book;
}

export function removeThread(book: ThreadBook, id: string): ThreadBook {
  if (!book.threads.some((thread) => thread.id === id)) return book;
  const threads = book.threads.filter((thread) => thread.id !== id);
  return {
    threads,
    activeId:
      book.activeId === "" || threads.some((thread) => thread.id === book.activeId)
        ? book.activeId
        : (threads[0]?.id ?? ""),
  };
}
