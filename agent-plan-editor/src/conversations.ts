import { createBrowserStorage } from "agent-plan-storage/browser";
import type { ThreadBook } from "./chat-threads";
import { createConversationStore } from "./conversation-store";
import { environmentStorage } from "./environment-store";
import type { FlowDocument } from "./library";

const conversations = createConversationStore(
  createBrowserStorage(),
  createBrowserStorage("agent-plan-conversations"),
  environmentStorage,
);
export function loadConversations(doc: FlowDocument) {
  return conversations.load(doc.id);
}
export function saveConversations(docId: string, book: ThreadBook) {
  return conversations.save(docId, book);
}
