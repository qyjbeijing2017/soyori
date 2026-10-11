import { Button, Modal, NativeSelect, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { parseFlow } from "agent-plan-core";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentChat } from "./AgentChat";
import { AiSettings } from "./AiSettings";
import { BrowserAiHost } from "./ai-host";
import { loadAiSettings, saveAiSettings } from "./ai-settings";
import { assistantFlow } from "./assistant-flow";
import { removeThread, type ThreadBook, updateThread } from "./chat-threads";
import { loadConversations, saveConversations } from "./conversations";
import { DescriptionInput } from "./DescriptionInput";
import example from "./example.json";
import { FlowEditor } from "./FlowEditor";
import { tr } from "./i18n";
import {
  canChat,
  deleteDocument,
  type FlowDocument,
  loadLibrary,
  makeDocument,
  saveDocument,
} from "./library";
import { ModelDownloadProgress } from "./ModelDownloadProgress";
import { NavigationDrawer } from "./NavigationDrawer";
import { projectDocs } from "./project-docs";
import { Icon, IconButton } from "./ui";
import { WorkspaceLibrary } from "./WorkspaceLibrary";

const DocumentPage = lazy(() => import("./DocumentPage"));
type Page = "agent" | "library" | "editor" | "document";
export function App() {
  const formId = useId();
  const { i18n } = useTranslation();
  const mobile = useMediaQuery("(max-width: 48em)");
  const [page, setPage] = useState<Page>(() =>
    location.hash.startsWith("#document/") ? "document" : "agent",
  );
  useEffect(() => {
    const navigate = () => setPage(location.hash.startsWith("#document/") ? "document" : "agent");
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    if (page === "document" && !location.hash.startsWith("#document/"))
      history.replaceState(null, "", "#document/introduction");
    else if (page !== "document" && location.hash.startsWith("#document/"))
      history.replaceState(null, "", location.pathname + location.search);
  }, [page]);
  const [documents, setDocuments] = useState<FlowDocument[]>([]);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [agentSelected, setAgentSelected] = useState(() => {
    try {
      return localStorage.getItem("agent-plan-selected-agent") || "builtin-local-agent";
    } catch {
      return "builtin-local-agent";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("agent-plan-selected-agent", agentSelected);
    } catch {
      /* Keep the selection in memory when browser storage is unavailable. */
    }
  }, [agentSelected]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [books, setBooks] = useState<Record<string, ThreadBook>>({});
  const booksRef = useRef(books);
  const bookQueue = useRef<Promise<void>>(Promise.resolve());
  const [runningThreads, setRunningThreads] = useState<Record<string, string>>({});
  const [editorBusy, setEditorBusy] = useState(false);
  const busy = editorBusy || Object.keys(runningThreads).length > 0;
  const [threadSaving, setThreadSaving] = useState(false);
  const [settings, setSettings] = useState(loadAiSettings);
  const builtin = makeDocument(assistantFlow(settings), "builtin-local-agent");
  const chatDocs = [
    { ...builtin, flow: { ...builtin.flow, name: tr("AgentPlan助手") } },
    ...documents.filter((d) => canChat(d.flow)),
  ];
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      saveAiSettings(settings);
    } catch {
      /* Keep settings in memory when storage is unavailable. */
    }
  }, [settings]);
  const [host] = useState(() => {
    const host = new BrowserAiHost();
    host.documentation = projectDocs;
    return host;
  });
  useEffect(() => {
    const refresh = () => {
      void loadLibrary()
        .then(setDocuments)
        .catch((cause) => setError(String(cause)));
      setLibraryRevision((value) => value + 1);
    };
    window.addEventListener("agent-plan-workspace-changed", refresh);
    return () => window.removeEventListener("agent-plan-workspace-changed", refresh);
  }, []);
  useEffect(() => {
    void host.downloads.restore().catch(() => {});
    return () => host.dispose();
  }, [host]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "agent-plan-background-initialization",
        String(settings.backgroundInitialization),
      );
    } catch {
      /* Keep settings in memory if storage is unavailable. */
    }
    if (settings.backgroundInitialization && settings.allowLocalDownload)
      void host.initialize().catch(() => {});
    else host.cancelInitialization();
  }, [host, settings.backgroundInitialization, settings.allowLocalDownload]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadDelete, setThreadDelete] = useState<{
    docId: string;
    id: string;
    title: string;
  } | null>(null);
  const [threadDeleteError, setThreadDeleteError] = useState("");
  const [rename, setRename] = useState<FlowDocument | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationDirectory, setCreationDirectory] = useState("");
  const [metadataError, setMetadataError] = useState("");
  const [deleting, setDeleting] = useState<FlowDocument | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const doc = documents.find((entry) => entry.id === selected);
  const agentDoc = chatDocs.find((entry) => entry.id === agentSelected) ?? chatDocs[0];
  const chatIds = chatDocs.map((d) => d.id).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: Load histories when library membership changes, not on flow edits or language changes.
  useEffect(() => {
    let active = true;
    void Promise.all(
      chatDocs.map(async (entry) => [entry.id, await loadConversations(entry)] as const),
    )
      .then((entries) => {
        if (active) {
          booksRef.current = { ...Object.fromEntries(entries), ...booksRef.current };
          setBooks(booksRef.current);
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [chatIds]);
  function updateBook(docId: string, change: (book: ThreadBook) => ThreadBook) {
    const task = bookQueue.current.then(async () => {
      const current = booksRef.current[docId];
      if (!current) throw new Error(tr("会话记录尚未加载。"));
      const next = change(current);
      await saveConversations(docId, next);
      booksRef.current = { ...booksRef.current, [docId]: next };
      setBooks(booksRef.current);
    });
    bookQueue.current = task.catch(() => {});
    return task;
  }
  async function chooseThread(docId: string, id?: string) {
    const target = chatDocs.find((entry) => entry.id === docId);
    if (threadSaving || !target) return;
    setThreadSaving(true);
    try {
      await updateBook(docId, (book) => ({
        ...book,
        activeId: id && book.threads.some((thread) => thread.id === id) ? id : "",
      }));
      setAgentSelected(docId);
      setPage("agent");
      if (mobile) setDrawerOpen(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setThreadSaving(false);
    }
  }
  useEffect(() => {
    let active = true;
    void loadLibrary()
      .then((docs) => {
        if (active) {
          setDocuments(docs);
          setSelected(docs.find((d) => d.id === "local-agent")?.id ?? docs[0]?.id ?? "");
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      host.dispose();
    };
  }, [host]);
  async function persist(next: FlowDocument, directory = "") {
    setSaving(true);
    setError("");
    try {
      const saved = await saveDocument(next, directory);
      setDocuments((docs) => [saved, ...docs.filter((entry) => entry.id !== saved.id)]);
    } finally {
      setSaving(false);
    }
  }
  function create(directory = "") {
    const next = makeDocument(parseFlow({ ...structuredClone(example), description: "" }));
    next.flow.name = "";
    setCreationDirectory(directory);
    setMetadataError("");
    setCreating(true);
    setRename(next);
  }
  function closeMetadata() {
    if (saving) return;
    setRename(null);
    setCreating(false);
    setMetadataError("");
  }
  return (
    <div
      className={`app-shell workspace-shell ${drawerOpen && !mobile && !settingsOpen ? "drawer-visible" : ""}`}
    >
      <div hidden={settingsOpen}>
        <NavigationDrawer opened={drawerOpen} onChange={setDrawerOpen} mobile={Boolean(mobile)}>
          <div className="drawer-brand">
            <img
              src={`${import.meta.env.BASE_URL}brand/agent-plan-logo.png`}
              alt=""
              width="32"
              height="32"
            />
            <strong>Agent Plan</strong>
            <IconButton
              icon="sidebarClose"
              label={tr("关闭抽屉")}
              onClick={() => setDrawerOpen(false)}
            />
          </div>
          <Button
            className="new-thread"
            leftSection={<Icon name="plus" />}
            disabled={threadSaving || !books[agentDoc.id]}
            onClick={() => void chooseThread(agentDoc.id)}
          >
            {tr("新对话")}
          </Button>
          <nav className="drawer-threads" aria-label={tr("对话列表")}>
            {chatDocs.map((entry) =>
              books[entry.id]?.threads.map((thread) => (
                <div
                  className={`thread-row ${agentDoc.id === entry.id && books[entry.id].activeId === thread.id ? "active" : ""}`}
                  key={`${entry.id}:${thread.id}`}
                >
                  <UnstyledButton
                    type="button"
                    className="thread-item"
                    disabled={threadSaving}
                    onClick={() => void chooseThread(entry.id, thread.id)}
                  >
                    <span>{thread.messages.length ? thread.title : tr("新对话")}</span>
                    <small>
                      {entry.flow.name}
                      {runningThreads[entry.id] === thread.id ? ` · ${tr("运行中")}` : ""}
                    </small>
                  </UnstyledButton>
                  <IconButton
                    icon="delete"
                    title={
                      runningThreads[entry.id] === thread.id
                        ? tr("请先停止此会话，再删除。")
                        : undefined
                    }
                    label={tr("删除对话 {{name}}", {
                      name: thread.messages.length ? thread.title : tr("新对话"),
                    })}
                    disabled={runningThreads[entry.id] === thread.id || threadSaving}
                    onClick={() => {
                      setThreadDeleteError("");
                      setThreadDelete({
                        docId: entry.id,
                        id: thread.id,
                        title: thread.messages.length ? thread.title : tr("新对话"),
                      });
                    }}
                  />
                </div>
              )),
            )}
          </nav>
          <Button
            className="drawer-document"
            variant={page === "document" ? "light" : "subtle"}
            leftSection={<Icon name="document" />}
            onClick={() => {
              setPage("document");
              if (mobile) setDrawerOpen(false);
            }}
          >
            Document
          </Button>
          <Button
            className="drawer-settings"
            variant="subtle"
            leftSection={<Icon name="settings" />}
            onClick={() => {
              setSettingsOpen(true);
              if (mobile) setDrawerOpen(false);
            }}
          >
            {tr("偏好设置")}
          </Button>
        </NavigationDrawer>
        <div className="workspace-main">
          <header className="workspace-toolbar">
            <div className="toolbar-side">
              {!drawerOpen && (
                <IconButton
                  icon="menu"
                  label={tr("打开抽屉")}
                  onClick={() => setDrawerOpen(true)}
                />
              )}
            </div>
            <nav className="workspace-tabs" aria-label={tr("主导航")}>
              {(["agent", "library", "editor"] as const).map((id) => (
                <UnstyledButton
                  type="button"
                  key={id}
                  aria-current={page === id ? "page" : undefined}
                  aria-label={tr({ agent: "对话", library: "流程库", editor: "编辑器" }[id])}
                  title={tr({ agent: "对话", library: "流程库", editor: "编辑器" }[id])}
                  className="navigation-tab"
                  disabled={saving || (id === "editor" && !doc)}
                  onClick={() => setPage(id)}
                >
                  <Icon name={id === "agent" ? "chat" : id === "library" ? "flow" : "edit"} />
                  <span className="navigation-label">
                    {tr({ agent: "对话", library: "流程库", editor: "编辑器" }[id])}
                  </span>
                </UnstyledButton>
              ))}
            </nav>
            <div className="toolbar-side" aria-hidden="true" />
          </header>
          <ModelDownloadProgress manager={host.downloads} />
          <main className={`page-content page-${page}`}>
            {error && (
              <div className="global-error" role="alert">
                {error}
                <Button
                  type="button"
                  variant="subtle"
                  className="quiet"
                  onClick={() => setError("")}
                >
                  {tr("关闭提示")}
                </Button>
              </div>
            )}
            {loading ? (
              <div className="loading-state">{tr("正在打开你的工作空间…")}</div>
            ) : (
              <>
                {page === "document" && (
                  <Suspense fallback={<p role="status">{tr("正在加载章节…")}</p>}>
                    <DocumentPage
                      onOpenExample={async (path) => {
                        const docs = await loadLibrary();
                        const imported = docs.find((doc) => doc.path === path);
                        if (!imported) throw Error(tr("示例流程未找到。"));
                        setDocuments(docs);
                        setSelected(imported.id);
                        setPage("editor");
                      }}
                    />
                  </Suspense>
                )}
                {chatDocs.map((entry) => (
                  <div
                    key={`agent:${entry.id}`}
                    hidden={page !== "agent" || entry.id !== agentDoc.id}
                  >
                    <AgentChat
                      doc={entry}
                      documents={documents}
                      aiHost={host}
                      settings={settings}
                      executionBusy={busy}
                      onBusy={(running, threadId) =>
                        setRunningThreads((current) => {
                          const next = { ...current };
                          if (running && threadId) next[entry.id] = threadId;
                          else delete next[entry.id];
                          return next;
                        })
                      }
                      book={books[entry.id] ?? null}
                      onThreadChange={(thread, activate) =>
                        updateBook(entry.id, (book) => updateThread(book, thread, activate))
                      }
                      onLibrary={() => setPage("library")}
                      flows={chatDocs}
                      onSelectFlow={setAgentSelected}
                    />
                  </div>
                ))}
                {page === "library" && (
                  <WorkspaceLibrary
                    documents={documents}
                    disabled={saving || busy || threadSaving}
                    onNewChat={(id) => void chooseThread(id)}
                    onRefresh={async () => {
                      const docs = await loadLibrary();
                      setDocuments(docs);
                      setSelected((id) =>
                        docs.some((doc) => doc.id === id) ? id : (docs[0]?.id ?? ""),
                      );
                      setLibraryRevision((value) => value + 1);
                    }}
                    onCreate={create}
                    onEdit={(id) => {
                      setSelected(id);
                      setPage("editor");
                    }}
                    onMetadata={setRename}
                  />
                )}
                {doc && (
                  <div hidden={page !== "editor"}>
                    <FlowEditor
                      key={`editor:${doc.id}:${libraryRevision}`}
                      doc={doc}
                      documents={documents}
                      aiHost={host}
                      settings={settings}
                      executionBusy={Object.keys(runningThreads).length > 0}
                      onBusy={setEditorBusy}
                      saving={saving}
                      onSave={(flow) => persist({ ...doc, flow })}
                    />
                  </div>
                )}
                {!doc && !loading && page === "editor" && (
                  <div className="empty-panel">
                    <p>{tr("请先从 Library 选择一个流程。")}</p>
                    <Button type="button" onClick={() => setPage("library")}>
                      {tr("打开 Library")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      {settingsOpen && (
        <main className="settings-page">
          <header className="settings-page-header">
            <Button
              variant="subtle"
              leftSection={<Icon name="back" />}
              onClick={() => setSettingsOpen(false)}
            >
              {tr("返回")}
            </Button>
            <h1>{tr("偏好设置")}</h1>
          </header>
          <div className="settings-page-content">
            <section className="settings-group">
              <h2>{tr("常规")}</h2>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <strong>{tr("语言")}</strong>
                    <p>{tr("选择界面显示语言")}</p>
                  </div>
                  <NativeSelect
                    aria-label={tr("语言")}
                    value={i18n.resolvedLanguage ?? "zh-CN"}
                    onChange={(e) => void i18n.changeLanguage(e.target.value)}
                    data={[
                      { value: "zh-CN", label: "简体中文" },
                      { value: "en", label: "English" },
                    ]}
                  />
                </div>
              </div>
            </section>
            <AiSettings
              host={host}
              value={settings}
              disabled={busy}
              onChange={setSettings}
              onRelease={() => host.dispose()}
              downloads={host.downloads}
            />
          </div>
        </main>
      )}
      <Modal
        opened={Boolean(threadDelete)}
        zIndex={400}
        onClose={() => {
          if (!threadSaving) setThreadDelete(null);
        }}
        title={tr("删除对话")}
        closeOnEscape={!threadSaving}
        closeOnClickOutside={!threadSaving}
        closeButtonProps={{ "aria-label": tr("关闭"), disabled: threadSaving }}
      >
        <p style={{ overflowWrap: "anywhere" }}>
          {tr("确定删除对话「{{name}}」吗？聊天记录将被移除，流程和工具存储不会删除。", {
            name: threadDelete?.title,
          })}
        </p>
        {threadDeleteError && (
          <p className="error" role="alert">
            {threadDeleteError}
          </p>
        )}
        <div className="modal-actions">
          <Button data-autofocus disabled={threadSaving} onClick={() => setThreadDelete(null)}>
            {tr("取消")}
          </Button>
          <Button
            color="red"
            variant="filled"
            loading={threadSaving}
            disabled={Boolean(
              threadDelete && runningThreads[threadDelete.docId] === threadDelete.id,
            )}
            onClick={async () => {
              if (
                !threadDelete ||
                runningThreads[threadDelete.docId] === threadDelete.id ||
                threadSaving
              )
                return;
              setThreadSaving(true);
              try {
                await updateBook(threadDelete.docId, (book) => removeThread(book, threadDelete.id));
                setThreadDelete(null);
              } catch (cause) {
                setThreadDeleteError(String(cause));
              } finally {
                setThreadSaving(false);
              }
            }}
          >
            {tr("确认删除")}
          </Button>
        </div>
      </Modal>
      {rename && (
        <Modal
          opened
          onClose={closeMetadata}
          title={tr(creating ? "新建流程" : "名称与说明")}
          closeOnEscape={!saving}
          closeOnClickOutside={!saving}
          closeButtonProps={{ "aria-label": tr("关闭"), disabled: saving }}
        >
          <form
            className="dialog-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = String(data.get("name") ?? "").trim();
              const description = String(data.get("description") ?? "").trim();
              if (!name || saving) return;
              setMetadataError("");
              try {
                await persist(
                  { ...rename, flow: { ...rename.flow, name, description } },
                  creating ? creationDirectory : "",
                );
                if (creating) {
                  setSelected(rename.id);
                  setPage("editor");
                }
                setRename(null);
                setCreating(false);
              } catch (cause) {
                setMetadataError(String(cause));
              }
            }}
          >
            <section className="dialog-section dialog-identity">
              <label htmlFor={`${formId}-1`}>
                {tr("流程名称")}
                <TextInput
                  id={`${formId}-1`}
                  name="name"
                  required
                  defaultValue={rename.flow.name}
                />
              </label>
            </section>
            <section className="dialog-section dialog-description">
              <DescriptionInput
                label={tr("说明（可选）")}
                name="description"
                defaultValue={rename.flow.description ?? ""}
                autosize
                minRows={3}
                maxRows={8}
                mt="md"
              />
            </section>
            {metadataError && (
              <p className="error" role="alert">
                {metadataError}
              </p>
            )}
            <div className="modal-actions">
              <Button type="button" disabled={saving} onClick={closeMetadata}>
                {tr("取消")}
              </Button>
              <Button variant="filled" className="primary" disabled={saving} type="submit">
                {tr("保存")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <Modal
        opened={Boolean(deleting)}
        onClose={() => {
          if (!saving) setDeleting(null);
        }}
        title={tr("删除流程")}
        closeOnEscape={!saving}
        closeOnClickOutside={!saving}
        closeButtonProps={{ "aria-label": tr("关闭"), disabled: saving }}
      >
        <p style={{ overflowWrap: "anywhere" }}>
          {tr("确定删除「{{name}}」吗？此操作无法撤销。", { name: deleting?.flow.name })}
        </p>
        {deleteError && (
          <p className="error" role="alert">
            {deleteError}
          </p>
        )}
        <div className="actions dialog-actions">
          <Button data-autofocus disabled={saving} onClick={() => setDeleting(null)}>
            {tr("取消")}
          </Button>
          <Button
            color="red"
            variant="filled"
            loading={saving}
            disabled={busy}
            onClick={async () => {
              if (!deleting || saving || busy) return;
              setSaving(true);
              setDeleteError("");
              try {
                await deleteDocument(deleting.id);
                const remaining = documents.filter((entry) => entry.id !== deleting.id);
                setDocuments(remaining);
                if (selected === deleting.id) setSelected(remaining[0]?.id ?? "");
                if (agentSelected === deleting.id) setAgentSelected("");
                setDeleting(null);
              } catch (cause) {
                setDeleteError(String(cause));
              } finally {
                setSaving(false);
              }
            }}
          >
            {tr("确认删除")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
