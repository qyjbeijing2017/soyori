import { createBrowserStorage } from "agent-plan-storage/browser";
import {
  type ChatMessage,
  newThread,
  readThreadBook,
  type ThreadBook,
  validMessages,
} from "./chat-threads";
import type { FlowDocument } from "./library";

const transcripts = createBrowserStorage("agent-plan-conversations");
export async function loadConversations(doc: FlowDocument): Promise<ThreadBook> {
  const saved = await transcripts.read(`threads/${doc.id}`);
  if (saved.found) return readThreadBook(saved.value);
  const first = newThread(doc.id);
  first.id = "initial";
  first.memoryKey = `editor/threads/${doc.id}/initial/memory`;
  const legacy = await transcripts.read(`chat/${doc.id}`);
  if (legacy.found) {
    if (!validMessages(legacy.value)) throw Error("Invalid conversation history");
    first.messages = legacy.value as ChatMessage[];
    first.title =
      first.messages.find((m) => m.role === "user")?.content.slice(0, 24) || first.title;
    const oldKey = doc.flow.fields.memoryKey?.initial;
    if (typeof oldKey === "string") first.memoryKey = oldKey;
  }
  const book = { activeId: first.id, threads: [first] };
  await saveConversations(doc.id, book);
  return book;
}
export async function saveConversations(docId: string, book: ThreadBook) {
  await transcripts.write(`threads/${docId}`, book);
}
