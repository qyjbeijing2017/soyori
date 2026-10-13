import {
  Button,
  Drawer,
  Loader,
  Modal,
  Switch,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRuntime, fieldDefinitions, redactFailure, redactFields } from "soyori-core";
import {
  type Environment,
  effectiveEnvironment,
  saveEnvironment,
} from "soyori-storage/environment";
import type { AiSettings, BrowserAiHost } from "./ai-host";
import { formatChatOutput } from "./chat-contract";
import {
  appendExecution,
  type ChatExecution,
  executionSummary,
  observeChatTools,
  retainExecutions,
} from "./chat-execution";
import {
  type ChatMessage,
  type ChatThread,
  prepareThreadForSend,
  type ThreadBook,
  threadFlow,
} from "./chat-threads";
import { EnvironmentEditor } from "./EnvironmentEditor";
import { environmentStorage, flushEnvironmentWrites } from "./environment-store";
import { tr } from "./i18n";
import { canChat, type FlowDocument } from "./library";
import { loadLibraryGraph } from "./library-calls";
import { MarkdownText } from "./MarkdownText";
import { Icon } from "./ui";

export function AgentChat({
  doc,
  documents,
  aiHost,
  settings,
  onBusy,
  book,
  onThreadChange,
  executionBusy,
  onLibrary,
  flows,
  onSelectFlow,
  environmentOpen = false,
  onEnvironmentClose = () => {},
}: {
  doc: FlowDocument;
  documents: FlowDocument[];
  aiHost: BrowserAiHost;
  settings: AiSettings;
  onBusy: (value: boolean, threadId?: string) => void;
  executionBusy: boolean;
  book: ThreadBook | null;
  onThreadChange: (thread: ChatThread, activate?: boolean) => Promise<void>;
  onLibrary: () => void;
  flows: FlowDocument[];
  onSelectFlow: (id: string) => void;
  environmentOpen?: boolean;
  onEnvironmentClose?: () => void;
}) {
  const [runs, setRuns] = useState<ChatExecution[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState(false);
  const [draftEnvironment, setDraftEnvironment] = useState<Environment>({});
  const mobile = useMediaQuery("(max-width: 640px)");
  const inspected = runs.find((run) => run.id === selectedRun);
  const [transcripts, setTranscripts] = useState<Record<string, ChatMessage[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = book?.activeId ?? "";
  const prompt = drafts[draftKey] ?? "";
  const setPrompt = (value: string) => setDrafts((current) => ({ ...current, [draftKey]: value }));
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const error = errors[draftKey] ?? "";
  const [runningThread, setRunningThread] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const model = useSyncExternalStore(aiHost.subscribe, aiHost.getSnapshot);
  const [progress, setProgress] = useState("");
  const download = useSyncExternalStore(aiHost.downloads.subscribe, aiHost.downloads.getSnapshot);
  const downloading = ["downloading", "paused"].includes(download.status);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const activeThread = book?.threads.find((t) => t.id === book.activeId);
  const messages = activeThread ? (transcripts[activeThread.id] ?? activeThread.messages) : [];
  const viewBusy = busy && runningThread === activeThread?.id;
  const setMessagesFor = (id: string, value: ChatMessage[]) =>
    setTranscripts((current) => ({ ...current, [id]: value }));
  const setErrorFor = (id: string, value: string) =>
    setErrors((current) => ({ ...current, [id]: value }));
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (messages.length || (viewBusy && (progress || preview)))
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, progress, preview, viewBusy]);
  async function send() {
    if (lock.current || executionBusy || loading || !book || !prompt.trim()) return;
    const { thread } = prepareThreadForSend(book, doc.id);
    const question = prompt.trim();
    const prior = messages;
    lock.current = true;
    setBusy(true);
    setRunningThread(thread.id);
    onBusy(true, thread.id);
    setErrorFor(thread.id, "");
    setPreview("");
    setProgress(tr("正在准备回答…"));
    setMessagesFor(thread.id, [...prior, { role: "user", content: question }]);
    setPrompt("");
    abort.current = new AbortController();
    const run: ChatExecution = {
      id: crypto.randomUUID(),
      threadId: thread.id,
      messageIndex: prior.length + 1,
      status: "running",
      snapshots,
      entries: [],
      dropped: 0,
    };
    const publish = () =>
      setRuns((current) =>
        retainExecutions([
          ...current.filter((item) => item.id !== run.id),
          { ...run, entries: [...run.entries] },
        ]),
      );
    publish();
    let inputSaved = false;
    const incoming: ChatMessage[] = [...prior, { role: "user", content: question }];
    const pendingThread = {
      ...thread,
      messages: incoming,
      title: thread.messages.length ? thread.title : question.slice(0, 24),
    };
    try {
      // Make this turn's original input available to storage.read before executing the flow.
      await onThreadChange(pendingThread, true);
      inputSaved = true;
      if (!book.activeId) {
        await saveEnvironment(environmentStorage, draftEnvironment, thread.id);
        setDraftEnvironment({});
      }
      abort.current.signal.throwIfAborted();
      const graph = loadLibraryGraph({ ...doc, flow: threadFlow(doc.flow, thread) }, documents);
      await flushEnvironmentWrites();
      const environment = await effectiveEnvironment(environmentStorage, thread.id);
      const runtime = createRuntime(
        graph,
        { chatIn: question, threadId: thread.id },
        {
          functions: observeChatTools(
            aiHost.tools(
              settings,
              abort.current.signal,
              setProgress,
              graph,
              () => runtime.getStack().at(-1)?.source,
              (event) => {
                if (abort.current?.signal.aborted) return;
                if (event.type === "start") setPreview("");
                else if (event.type === "text") {
                  if (!fieldDefinitions(doc.flow.fields).chatOut?.sensitive) setPreview(event.text);
                } else {
                  appendExecution(run, {
                    label: "llm.metrics",
                    status: "completed",
                    ms: 0,
                    output: executionSummary(event.values),
                  });
                  publish();
                }
              },
              false,
              environment,
              { threadId: thread.id },
            ),
            run,
            publish,
            () => runtime.getStack().some((frame) => frame.getSensitiveFields().length > 0),
          ),
        },
      );
      let steps = 0;
      while (!["completed", "failed"].includes(runtime.getState().status)) {
        abort.current.signal.throwIfAborted();
        if (++steps > 2000) throw Error(tr("本次对话超过 2000 步，请到 Editor 检查循环。"));
        const before = run.snapshots
          ? executionSummary(
              redactFields(runtime.getState().fields, runtime.getSensitiveFields()),
              4000,
            )
          : undefined;
        const started = performance.now();
        const active = runtime.getStack().at(-1);
        const result = await runtime.step();
        if (result.event) {
          appendExecution(run, {
            label: `${result.event.flowName} · ${result.event.path} · ${result.event.type}`,
            status: result.event.error ? "failed" : "completed",
            ms: Math.round(performance.now() - started),
            ...(result.event.error
              ? {
                  error: executionSummary(
                    redactFailure(result.event.error, active?.getSensitiveFields() ?? []),
                  ),
                }
              : {}),
            ...(run.snapshots
              ? {
                  before,
                  after: executionSummary(
                    redactFields(
                      result.state.fields,
                      active?.getSensitiveFields() ?? runtime.getSensitiveFields(),
                    ),
                    4000,
                  ),
                }
              : {}),
          });
          publish();
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const state = runtime.getState();
      if (state.error)
        throw Error(redactFailure(state.error, runtime.getSensitiveFields()).message);
      run.status = "completed";
      publish();
      const answer = formatChatOutput(
        redactFields(state.output ?? {}, runtime.getSensitiveFields()).chatOut,
      );
      const next: ChatMessage[] = [
        ...prior,
        { role: "user", content: question },
        {
          role: "assistant",
          content: answer,
          ...(typeof state.output?.chatOut === "string" ? {} : { format: "yaml" as const }),
        },
      ];
      setMessagesFor(thread.id, next);
      try {
        await onThreadChange({ ...pendingThread, messages: next });
      } catch {
        setErrorFor(thread.id, tr("回答已生成，但对话记录保存失败。请检查浏览器存储空间。"));
      }
    } catch (cause) {
      run.status = "failed";
      appendExecution(run, {
        label: tr("运行失败"),
        status: "failed",
        ms: 0,
        error: String(cause).slice(0, 2000),
      });
      publish();
      if (!inputSaved) {
        setMessagesFor(thread.id, prior);
        setPrompt(question);
      }
      setErrorFor(
        inputSaved ? thread.id : draftKey,
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setRunningThread(null);
      onBusy(false);
      setProgress("");
      setPreview("");
    }
  }
  return (
    <section className="chat-page">
      <Modal
        opened={environmentOpen}
        onClose={onEnvironmentClose}
        title={tr("当前对话环境")}
        centered
      >
        {book?.activeId && (
          <EnvironmentEditor key={book.activeId} threadId={book.activeId} disabled={busy} />
        )}
        {book && !book.activeId && (
          <EnvironmentEditor
            draftValues={draftEnvironment}
            onSaveDraft={setDraftEnvironment}
            disabled={busy}
          />
        )}
      </Modal>
      <Drawer
        opened={selectedRun !== null}
        onClose={() => setSelectedRun(null)}
        title={tr("执行记录")}
        position="right"
        size={mobile ? "100%" : "lg"}
      >
        <Switch
          label={tr("记录变量快照")}
          checked={snapshots}
          onChange={(event) => setSnapshots(event.currentTarget.checked)}
        />
        <p className="muted">{tr("仅对后续运行生效，会增加内存占用。")}</p>
        <Button
          variant="subtle"
          disabled={busy}
          onClick={() => {
            setRuns([]);
            setSelectedRun(null);
          }}
        >
          {tr("清空记录")}
        </Button>
        <p className="muted">
          {tr("仅保存在内存中，刷新后清除；最多保留 8 轮，总文本约 512 KB。")}
        </p>
        {inspected && (
          <>
            <p>
              {tr(
                inspected.status === "running"
                  ? "执行中"
                  : inspected.status === "failed"
                    ? "运行失败"
                    : "执行完成",
              )}
            </p>
            {inspected.dropped > 0 && <p>{tr("较早的步骤记录已截断")}</p>}
            {inspected.entries.map((entry) => (
              <details className="execution-entry" key={entry.id}>
                <summary>
                  {entry.label} ·{" "}
                  {tr(
                    entry.status === "running"
                      ? "执行中"
                      : entry.status === "failed"
                        ? "失败"
                        : "完成",
                  )}{" "}
                  · {entry.ms} ms
                </summary>
                {entry.error && <pre className="error">{entry.error}</pre>}
                {[
                  [tr("输入"), entry.input],
                  [tr("输出"), entry.output],
                  [tr("执行前快照"), entry.before],
                  [tr("执行后快照"), entry.after],
                ].map(
                  ([label, value]) =>
                    value && (
                      <details key={label}>
                        <summary>{label}</summary>
                        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                          {value}
                        </pre>
                      </details>
                    ),
                )}
              </details>
            ))}
          </>
        )}
      </Drawer>
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
              disabled={loading}
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
            {!messages.length && !viewBusy && (
              <div className="chat-empty">
                <img
                  src={`${import.meta.env.BASE_URL}brand/soyori-logo.png?v=breeze-1`}
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
                <MarkdownText source={message.content} format={message.format} />
                {message.role === "assistant" &&
                  runs
                    .filter((run) => run.threadId === activeThread?.id && run.messageIndex === i)
                    .map((run) => (
                      <Button
                        key={run.id}
                        variant="subtle"
                        size="compact-xs"
                        onClick={() => setSelectedRun(run.id)}
                      >
                        {tr("执行记录")}
                      </Button>
                    ))}
              </article>
            ))}
            {viewBusy && preview && (
              <article className="chat-message assistant">
                <span className="message-author">{doc.flow.name}</span>
                <MarkdownText source={preview} />
              </article>
            )}
            {viewBusy && (
              <p className="chat-progress" role="status">
                {model.status === "initializing" &&
                  progress === "正在初始化本地模型，可能需要几分钟，请耐心等待。" && (
                    <Loader
                      size="sm"
                      style={{ display: "inline-block", verticalAlign: "middle", marginRight: 8 }}
                    />
                  )}
                {progress ? tr(progress) : tr("处理中…")}
              </p>
            )}
            {runs
              .filter((run) => run.threadId === activeThread?.id && run.status !== "completed")
              .map((run) => (
                <Button
                  key={run.id}
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => setSelectedRun(run.id)}
                >
                  {tr("执行记录")}
                </Button>
              ))}
            <div ref={bottom} />
          </div>
          <div className="composer-wrap">
            {executionBusy && !viewBusy && (
              <p className="muted" role="status">
                {tr("另一会话正在运行，完成后可发送。")}
              </p>
            )}
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
                disabled={viewBusy || loading}
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
                  disabled={loading}
                  aria-label={tr("选择对话流程")}
                  onClick={() => {
                    setQuery("");
                    setChoosing(true);
                  }}
                >
                  <span className="agent-picker-name">{doc.flow.name}</span>
                </Button>
                {viewBusy || downloading ? (
                  <Button
                    type="button"
                    aria-label={tr("停止")}
                    onClick={() => {
                      abort.current?.abort();
                      aiHost.dispose();
                    }}
                  >
                    <Icon name="stop" />
                  </Button>
                ) : (
                  <Button
                    variant="filled"
                    className="primary"
                    type="submit"
                    aria-label={tr("发送消息")}
                    disabled={executionBusy || loading || !prompt.trim()}
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
