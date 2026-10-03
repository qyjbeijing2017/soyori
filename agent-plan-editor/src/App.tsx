import { Button, Modal, NativeSelect, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { parseFlow } from "agent-plan-core";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentChat } from "./AgentChat";
import { AiSettings } from "./AiSettings";
import { BrowserAiHost, initialAiSettings } from "./ai-host";
import { newThread, removeThread, type ThreadBook } from "./chat-threads";
import { loadConversations, saveConversations } from "./conversations";
import { DescriptionInput } from "./DescriptionInput";
import example from "./example.json";
import { FlowEditor } from "./FlowEditor";
import { readFlowFile } from "./flow-files";
import { tr } from "./i18n";
import {
  canChat,
  deleteDocument,
  downloadDocument,
  type FlowDocument,
  loadLibrary,
  makeDocument,
  saveDocument,
} from "./library";
import { MarkdownText } from "./MarkdownText";
import { NavigationDrawer } from "./NavigationDrawer";

import { EllipsisText, Icon, IconButton } from "./ui";

type Page = "agent" | "library" | "editor";
export function App() {
  const formId = useId();
  const { i18n } = useTranslation();
  const mobile = useMediaQuery("(max-width: 48em)");
  const [page, setPage] = useState<Page>("agent");
  const [documents, setDocuments] = useState<FlowDocument[]>([]);
  const [agentSelected, setAgentSelected] = useState("builtin-local-agent");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [books, setBooks] = useState<Record<string, ThreadBook>>({});
  const [threadSaving, setThreadSaving] = useState(false);
  const [builtin] = useState(() =>
    makeDocument(parseFlow(structuredClone(example)), "builtin-local-agent"),
  );
  const chatDocs = [
    { ...builtin, flow: { ...builtin.flow, name: tr("本地 Agent") } },
    ...documents.filter((d) => canChat(d.flow)),
  ];
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(initialAiSettings);
  const [host] = useState(() => new BrowserAiHost());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadDelete, setThreadDelete] = useState<{
    docId: string;
    id: string;
    title: string;
  } | null>(null);
  const [threadDeleteError, setThreadDeleteError] = useState("");
  const [rename, setRename] = useState<FlowDocument | null>(null);
  const [creating, setCreating] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [deleting, setDeleting] = useState<FlowDocument | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState("");
  const upload = useRef<HTMLInputElement>(null);
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
        if (active) setBooks((current) => ({ ...Object.fromEntries(entries), ...current }));
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [chatIds]);
  async function updateBook(docId: string, book: ThreadBook) {
    await saveConversations(docId, book);
    setBooks((current) => ({ ...current, [docId]: book }));
  }
  async function chooseThread(docId: string, id?: string) {
    if (busy || threadSaving || !books[docId]) return;
    setThreadSaving(true);
    try {
      const book = books[docId],
        fresh = id ? null : newThread(docId);
      await updateBook(docId, {
        activeId: id ?? fresh!.id,
        threads: fresh ? [fresh, ...book.threads] : book.threads,
      });
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
  async function persist(next: FlowDocument) {
    setSaving(true);
    setError("");
    try {
      const saved = await saveDocument(next);
      setDocuments((docs) => [saved, ...docs.filter((entry) => entry.id !== saved.id)]);
    } finally {
      setSaving(false);
    }
  }
  function create() {
    const next = makeDocument(parseFlow(structuredClone(example)));
    next.flow.name = "";
    next.flow.description = "";
    next.flow.fields.memoryKey.initial = `editor/${next.id}/memory`;
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
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setSaving(true);
    setError("");
    try {
      const incoming: FlowDocument[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024)
          throw Error(tr("{{name}} 超过 5 MB，无法导入。", { name: file.name }));
        const text = (await file.text()).replace(/^\uFEFF/, "");
        try {
          incoming.push(makeDocument(readFlowFile(text, file.name)));
        } catch (cause) {
          throw Error(`${file.name}：${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      for (const item of incoming) {
        const saved = await saveDocument(item);
        setDocuments((docs) => [saved, ...docs]);
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
      if (upload.current) upload.current.value = "";
    }
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
            disabled={busy || threadSaving || !books[agentDoc.id]}
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
                    disabled={busy || threadSaving}
                    onClick={() => void chooseThread(entry.id, thread.id)}
                  >
                    <span>{thread.messages.length ? thread.title : tr("新对话")}</span>
                    <small>{entry.flow.name}</small>
                  </UnstyledButton>
                  <IconButton
                    icon="delete"
                    label={tr("删除对话 {{name}}", {
                      name: thread.messages.length ? thread.title : tr("新对话"),
                    })}
                    disabled={busy || threadSaving}
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
                  disabled={busy || saving || (id === "editor" && !doc)}
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
                {agentDoc && (
                  <div hidden={page !== "agent"}>
                    <AgentChat
                      key={`agent:${agentDoc.id}`}
                      doc={agentDoc}
                      documents={documents}
                      aiHost={host}
                      settings={settings}
                      onBusy={setBusy}
                      book={books[agentDoc.id] ?? null}
                      onBookChange={(book) => updateBook(agentDoc.id, book)}
                      onLibrary={() => setPage("library")}
                      flows={chatDocs}
                      onSelectFlow={setAgentSelected}
                    />
                  </div>
                )}
                {page === "library" && (
                  <section className="library-page">
                    <div className="library-toolbar">
                      <TextInput
                        type="search"
                        aria-label={tr("搜索流程")}
                        placeholder={tr("搜索流程…")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="library-count">
                        {tr("{{count}} 个流程", { count: documents.length })}
                      </span>
                      <input
                        ref={upload}
                        hidden
                        type="file"
                        multiple
                        accept=".json,.yaml,.yml"
                        aria-label={tr("上传流程文件")}
                        onChange={(e) => void importFiles(e.target.files)}
                      />
                      <Button
                        className="library-tool"
                        variant="subtle"
                        aria-label={tr("↑ 上传流程")}
                        disabled={saving}
                        onClick={() => upload.current?.click()}
                      >
                        <Icon name="upload" />
                        <span>{tr("上传流程")}</span>
                      </Button>
                      <Button
                        className="library-tool"
                        aria-label={tr("＋ 新建流程")}
                        variant="subtle"
                        disabled={saving || loading}
                        onClick={create}
                      >
                        <Icon name="plus" />
                        <span>{tr("新建流程")}</span>
                      </Button>
                    </div>
                    <div className="flow-cards">
                      {documents
                        .filter((entry) =>
                          entry.flow.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((entry) => (
                          <article className="flow-library-card" key={entry.id}>
                            <UnstyledButton
                              className="card-open"
                              aria-label={tr("编辑流程 {{name}}", { name: entry.flow.name })}
                              disabled={saving}
                              onClick={() => {
                                setSelected(entry.id);
                                setPage("editor");
                              }}
                            />
                            <div className="card-name-row">
                              <span className="flow-symbol">
                                <Icon name={canChat(entry.flow) ? "chat" : "flow"} />
                              </span>
                              <h2>
                                <EllipsisText text={entry.flow.name} />
                              </h2>
                              <span className="tag">
                                {canChat(entry.flow) ? tr("对话 Agent") : tr("流程")}
                              </span>
                            </div>
                            <MarkdownText
                              className="card-description"
                              source={entry.flow.description || ""}
                            />
                            <div className="card-top">
                              <div className="card-icon-actions">
                                <IconButton
                                  icon="edit"
                                  label={tr("名称与说明")}
                                  disabled={saving}
                                  onClick={() => setRename(entry)}
                                />
                                {canChat(entry.flow) && (
                                  <IconButton
                                    icon="chat"
                                    label={tr("对话")}
                                    disabled={saving}
                                    onClick={() => {
                                      setAgentSelected(entry.id);
                                      setPage("agent");
                                    }}
                                  />
                                )}
                                <IconButton
                                  icon="download"
                                  label={tr("下载 YAML")}
                                  onClick={() => downloadDocument(entry)}
                                />
                                <IconButton
                                  icon="delete"
                                  label={tr("删除流程")}
                                  disabled={saving || busy}
                                  onClick={() => {
                                    setDeleteError("");
                                    setDeleting(entry);
                                  }}
                                />
                              </div>
                            </div>
                          </article>
                        ))}
                    </div>
                    {!documents.filter((entry) =>
                      entry.flow.name.toLowerCase().includes(search.toLowerCase()),
                    ).length && (
                      <p className="empty-panel">
                        {tr("没有匹配的流程。试试其他名称，或上传一个流程文件。")}
                      </p>
                    )}
                  </section>
                )}
                {doc && (
                  <div hidden={page !== "editor"}>
                    <FlowEditor
                      key={`editor:${doc.id}`}
                      doc={doc}
                      documents={documents}
                      aiHost={host}
                      settings={settings}
                      onBusy={setBusy}
                      saving={saving}
                      onSave={(flow) => persist({ ...doc, flow })}
                    />
                  </div>
                )}
                {!doc && !loading && page !== "library" && (
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
              value={settings}
              disabled={busy}
              onChange={setSettings}
              onRelease={() => host.dispose()}
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
            disabled={busy}
            onClick={async () => {
              if (!threadDelete || busy || threadSaving) return;
              setThreadSaving(true);
              try {
                await updateBook(
                  threadDelete.docId,
                  removeThread(books[threadDelete.docId], threadDelete.id),
                );
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
                await persist({ ...rename, flow: { ...rename.flow, name, description } });
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
