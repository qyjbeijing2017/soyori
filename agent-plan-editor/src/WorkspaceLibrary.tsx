import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { canChat } from "./chat-contract";
import { type FileAction, FileBrowser, type FileMutation } from "./FileBrowser";
import { readFlowFile } from "./flow-files";
import { tr } from "./i18n";
import type { FlowDocument } from "./library";
import {
  changeFiles,
  downloadBlob,
  exportWorkspace,
  importWorkspace,
  listFiles,
  moveFile,
  newFile,
  type WorkspaceFile,
  writeFiles,
} from "./workspace-files";

export function WorkspaceLibrary({
  documents,
  onRefresh,
  onEdit,
  onCreate,
  onMetadata,
  onNewChat,
  disabled,
}: {
  documents: FlowDocument[];
  onRefresh: () => Promise<void>;
  onEdit: (id: string) => void;
  onCreate: (directory: string) => void;
  onMetadata: (doc: FlowDocument) => void;
  onNewChat: (id: string) => void;
  disabled: boolean;
}) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const importDirectory = useRef("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<WorkspaceFile | null>(null);
  const [source, setSource] = useState("");
  const folder = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh the file view after flow edits.
  useEffect(() => {
    void listFiles()
      .then(setFiles)
      .catch((e) => setError(String(e)));
  }, [documents]);
  async function perform(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await onRefresh();
      setFiles(await listFiles());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function open(file: WorkspaceFile, raw = false) {
    const doc = documents.find((d) => d.id === file.id);
    if (doc && !raw) {
      onEdit(doc.id);
      return;
    }
    if (
      file.content.size > 2 * 1024 * 1024 ||
      !/\.(js|mjs|cjs|ts|json|ya?ml|txt|md|csv|css|html|svg)$/i.test(file.path)
    ) {
      downloadBlob(file.content, file.path.split("/").at(-1)!);
      return;
    }
    setSource(await file.content.text());
    setEditor(file);
  }
  const chatFlowIds = useMemo(
    () => new Set(documents.filter((doc) => canChat(doc.flow)).map((doc) => doc.id)),
    [documents],
  );
  const flowIds = useMemo(() => new Set(documents.map((d) => d.id)), [documents]);
  const mutationQueue = useRef(Promise.resolve());
  function mutate(mutation: FileMutation) {
    const task = mutationQueue.current.then(() =>
      perform(async () => {
        if (mutation.type === "create") {
          const { file, parent } = mutation.value;
          const directory = parent.slice(1);
          if (file.file) await importWorkspace([file.file], directory, true);
          else
            await writeFiles([
              newFile(
                `${directory ? `${directory}/` : ""}${file.name}`,
                new Blob([
                  file.type !== "folder" && /\.(m?js)$/.test(file.name) ? "result(input);\n" : "",
                ]),
                file.type === "folder" ? "directory" : "file",
              ),
            ]);
        } else if (mutation.type === "rename") {
          const { id, name } = mutation.value;
          const parent = id.slice(1).split("/").slice(0, -1).join("/");
          await moveFile(id.slice(1), `${parent ? `${parent}/` : ""}${name}`);
        } else if (mutation.type === "delete") {
          await changeFiles(
            "delete",
            mutation.value.ids.map((id) => id.slice(1)),
          );
        } else {
          await changeFiles(
            mutation.type,
            mutation.value.ids.map((id) => id.slice(1)),
            mutation.value.target.slice(1),
          );
        }
      }),
    );
    mutationQueue.current = task;
    return task;
  }
  function fileAction(action: FileAction, target: string) {
    const file = files.find((f) => f.path === target);
    const isDirectory = !file || file.kind === "directory";
    if (action === "open" && isDirectory) {
      return;
    }
    if (action === "open" || action === "source") {
      if (file) void open(file, action === "source").catch((e) => setError(String(e)));
      return;
    }
    if (action === "new-chat") {
      const doc = documents.find((d) => d.id === file?.id);
      if (doc && canChat(doc.flow)) onNewChat(doc.id);
      return;
    }
    if (action === "metadata") {
      const doc = documents.find((d) => d.id === file?.id);
      if (doc) onMetadata(doc);
      return;
    }
    if (action === "download") {
      void perform(async () =>
        downloadBlob(
          isDirectory ? await exportWorkspace(target) : file!.content,
          isDirectory
            ? `${target.split("/").at(-1) || "workspace"}.agentp.zip`
            : target.split("/").at(-1)!,
        ),
      );
      return;
    }
  }
  const locked = disabled || busy;
  let diagnostic = "";
  if (editor && /\.(json|ya?ml)$/i.test(editor.path)) {
    try {
      readFlowFile(source, editor.path);
      diagnostic = tr("有效流程，保存后可用流程编辑器打开。");
    } catch (e) {
      diagnostic = `${tr("普通文件（未识别为有效流程）")}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return (
    <section className="library-page">
      <Stack gap="md">
        <input
          hidden
          type="file"
          multiple
          ref={folder}
          {...{ webkitdirectory: "" }}
          aria-label={tr("导入文件夹")}
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            if (files.length) void perform(() => importWorkspace(files, importDirectory.current));
            e.currentTarget.value = "";
          }}
        />
        {error && (
          <Text c="red" role="alert">
            {error}
          </Text>
        )}
        <FileBrowser
          files={files}
          flowIds={flowIds}
          chatFlowIds={chatFlowIds}
          locked={locked}
          onAction={fileAction}
          onCreateFlow={onCreate}
          onMutation={mutate}
          onImportFolder={(directory) => {
            importDirectory.current = directory;
            folder.current?.click();
          }}
        />
      </Stack>
      <Modal
        opened={Boolean(editor)}
        onClose={() => !busy && setEditor(null)}
        title={editor?.path}
        size="xl"
      >
        <CodeEditor
          label={tr("文件内容")}
          path={editor?.path}
          value={source}
          onChange={setSource}
          disabled={busy}
        />
        {error && (
          <Text c="red" role="alert">
            {error}
          </Text>
        )}
        {diagnostic && (
          <Text size="sm" mt="sm">
            {diagnostic}
          </Text>
        )}
        <Group justify="flex-end" mt="md">
          <Button disabled={busy} onClick={() => setEditor(null)}>
            {tr("取消")}
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              void perform(async () => {
                await writeFiles(
                  [
                    {
                      ...editor!,
                      content: new Blob([source]),
                      updatedAt: new Date().toISOString(),
                    },
                  ],
                  true,
                );
                setEditor(null);
              })
            }
          >
            {tr("保存")}
          </Button>
        </Group>
      </Modal>
    </section>
  );
}
