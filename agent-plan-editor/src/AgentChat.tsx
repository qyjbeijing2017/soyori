import { Button, Modal, Textarea, TextInput, UnstyledButton } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import type { AiSettings, BrowserAiHost } from "./ai-host";
import { type ChatMessage, newThread, type ThreadBook, threadFlow } from "./chat-threads";
import { tr } from "./i18n";
import { canChat, type FlowDocument } from "./library";
import { loadLibraryGraph } from "./library-calls";
import { createSession } from "./session";
import { Icon } from "./ui";

export function AgentChat({
  doc,
  documents,
  aiHost,
  settings,
  onBusy,
  book,
  onBookChange,
  onLibrary,
  flows,
  onSelectFlow,
}: {
  doc: FlowDocument;
  documents: FlowDocument[];
  aiHost: BrowserAiHost;
  settings: AiSettings;
  onBusy: (value: boolean) => void;
  book: ThreadBook | null;
  onBookChange: (book: ThreadBook) => Promise<void>;
  onLibrary: () => void;
  flows: FlowDocument[];
  onSelectFlow: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const choices = flows.filter(
    (entry) =>
      canChat(entry.flow) &&
      entry.flow.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const loading = !book;
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const activeThread = book?.threads.find((t) => t.id === book.activeId);
  useEffect(() => {
    setMessages(activeThread?.messages ?? []);
    setPrompt("");
    setError("");
  }, [activeThread]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (messages.length || progress) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, progress]);
  async function send() {
    if (lock.current || loading || !book || !prompt.trim()) return;
    const thread = book.threads.find((t) => t.id === book.activeId) ?? newThread(doc.id);
    const currentBook = book.threads.length ? book : { activeId: thread.id, threads: [thread] };
    const question = prompt.trim();
    const prior = messages;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setProgress(tr("正在准备回答…"));
    setMessages([...prior, { role: "user", content: question }]);
    setPrompt("");
    abort.current = new AbortController();
    try {
      const session = createSession(
        loadLibraryGraph({ ...doc, flow: threadFlow(doc.flow, thread) }, documents),
        { chatIn: question, memoryKey: thread.memoryKey },
        aiHost.tools(settings, abort.current.signal, setProgress),
      );
      let steps = 0;
      while (!["completed", "failed"].includes(session.runtime.getState().status)) {
        abort.current.signal.throwIfAborted();
        if (++steps > 2000) throw Error(tr("本次对话超过 2000 步，请到 Editor 检查循环。"));
        await session.step();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const state = session.runtime.getState();
      if (state.error) throw Error(state.error.message);
      const answer = state.output?.chatOut;
      if (typeof answer !== "string")
        throw Error(tr("这个流程没有返回文字 chatOut，请到 Editor 设置输出。"));
      const next: ChatMessage[] = [
        ...prior,
        { role: "user", content: question },
        { role: "assistant", content: answer },
      ];
      setMessages(next);
      const updated = {
        ...currentBook,
        threads: currentBook.threads.map((t) =>
          t.id === thread.id
            ? { ...t, messages: next, title: t.messages.length ? t.title : question.slice(0, 24) }
            : t,
        ),
      };
      try {
        await onBookChange(updated);
      } catch {
        setError(tr("回答已生成，但对话记录保存失败。请检查浏览器存储空间。"));
      }
    } catch (cause) {
      setMessages(prior);
      setPrompt(question);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
      setProgress("");
    }
  }
  return (
    <section className="chat-page">
      <Modal
        opened={choosing}
        onClose={() => setChoosing(false)}
        title={tr("选择 Agent")}
        centered
        size="sm"
        closeButtonProps={{ "aria-label": tr("关闭") }}
      >
        <TextInput
          data-autofocus
          type="search"
          aria-label={tr("搜索 Agent")}
          placeholder={tr("搜索 Agent")}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <div className="agent-choices">
          {choices.map((entry) => (
            <UnstyledButton
              key={entry.id}
              className={`agent-choice ${entry.id === doc.id ? "selected-agent" : ""}`}
              aria-current={entry.id === doc.id ? "true" : undefined}
              disabled={busy || loading}
              onClick={() => {
                setChoosing(false);
                onSelectFlow(entry.id);
              }}
            >
              <Icon name="chat" />
              <span>{entry.flow.name}</span>
            </UnstyledButton>
          ))}
          {!choices.length && <p className="muted">{tr("没有匹配的 Agent")}</p>}
        </div>
      </Modal>
      {!canChat(doc.flow) ? (
        <div className="chat-empty">
          <h1>{tr("这个流程还不是对话 Agent")}</h1>
          <p>{tr("流程的 chatOut 变量开启输出，即可在这里对话。")}</p>
          <Button type="button" onClick={onLibrary}>
            {tr("选择 Agent")}
          </Button>
        </div>
      ) : (
        <>
          <div className="chat-scroll" aria-live="polite">
            {!messages.length && !busy && (
              <div className="chat-empty">
                <img
                  src={`${import.meta.env.BASE_URL}brand/agent-plan-logo.png`}
                  width="72"
                  height="72"
                  alt=""
                />
                <h1>{tr("开始对话")}</h1>
              </div>
            )}
            {messages.map((message, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: The transcript is append-only and messages have no editable local state.
              <article className={`chat-message ${message.role}`} key={`${i}:${message.role}`}>
                <span className="message-author">
                  {message.role === "user" ? tr("你") : doc.flow.name}
                </span>
                <p>{message.content}</p>
              </article>
            ))}
            {busy && (
              <p className="chat-progress" role="status">
                {progress || tr("处理中…")}
              </p>
            )}
            <div ref={bottom} />
          </div>
          <div className="composer-wrap">
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Textarea
                aria-label={tr("发送消息")}
                autosize
                minRows={2}
                maxRows={8}
                styles={{ input: { border: 0, background: "transparent" } }}
                value={prompt}
                disabled={busy || loading}
                placeholder={tr("给 Agent 发消息…")}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-tools">
                <Button
                  className="agent-picker"
                  variant="subtle"
                  disabled={busy || loading}
                  aria-label={tr("选择对话流程")}
                  onClick={() => {
                    setQuery("");
                    setChoosing(true);
                  }}
                >
                  <span className="agent-picker-name">{doc.flow.name}</span>
                </Button>
                {busy ? (
                  <Button
                    type="button"
                    aria-label={tr("停止")}
                    onClick={() => abort.current?.abort()}
                  >
                    <Icon name="stop" />
                  </Button>
                ) : (
                  <Button
                    variant="filled"
                    className="primary"
                    type="submit"
                    aria-label={tr("发送消息")}
                    disabled={loading || !prompt.trim()}
                  >
                    <Icon name="send" />
                  </Button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
