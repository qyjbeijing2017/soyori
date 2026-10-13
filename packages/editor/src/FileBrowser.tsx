import { cn, en } from "@svar-ui/filemanager-locales";
import { Locale, Modal, Text } from "@svar-ui/react-core";
import {
  Filemanager,
  getMenuOptions,
  type IApi,
  type IEntity,
  type IFileMenuOption,
  type TMethodsConfig,
  Willow,
} from "@svar-ui/react-filemanager";
import "@svar-ui/react-filemanager/all.css";
import { useCallback, useMemo, useRef, useState } from "react";
import chatFlowFileIcon from "./assets/chat-flow-file.svg";
import flowFileIcon from "./assets/flow-file.svg";
import scriptFileIcon from "./assets/script-file.svg";
import i18n, { tr } from "./i18n";
import type { WorkspaceFile } from "./workspace-files";

// Correct upstream machine-translated file-manager labels without changing its UI.
const chinese = {
  ...cn,
  filemanager: {
    ...(cn.filemanager as Record<string, string>),
    "Add New": "新建",
    Ok: "确定",
    Name: "名称",
    Size: "大小",
    Download: "下载",
    Cut: "剪切",
    Count: "数量",
    Found: "已找到",
    Preview: "预览",
    "Enter file name": "输入文件名",
    "Enter folder name": "输入文件夹名称",
    "Search results in": "搜索范围",
    "Multiple files": "多个文件",
    multiple: "多个",
    used: "已使用",
    "Select file or folder to view details": "选择文件或文件夹查看详情",
  },
};

export type FileAction = "new-chat" | "open" | "source" | "metadata" | "download";
export type FileMutation =
  | { type: "create"; value: TMethodsConfig["create-file"] }
  | { type: "rename"; value: TMethodsConfig["rename-file"] }
  | { type: "copy" | "move"; value: TMethodsConfig["copy-files"] }
  | { type: "delete"; value: TMethodsConfig["delete-files"] };
type Props = {
  files: WorkspaceFile[];
  flowIds: Set<string>;
  chatFlowIds: Set<string>;
  locked: boolean;
  onAction: (action: FileAction, path: string) => void;
  onCreateFlow: (directory: string) => void;
  onImportFolder: (directory: string) => void;
  onMutation: (mutation: FileMutation) => Promise<void>;
};
export function FileBrowser(props: Props) {
  const { files, flowIds, chatFlowIds, locked, onAction } = props;
  const api = useRef<IApi | null>(null);
  const [creation, setCreation] = useState<{ type: "file" | "folder"; parent: string } | null>(
    null,
  );
  const [creationName, setCreationName] = useState("");
  const [creationError, setCreationError] = useState(false);

  const latest = useRef(props);
  latest.current = props;
  const view = useRef<{
    mode: "table" | "cards" | "panels" | "search";
    panels: { path: string; selected: string[] }[];
    activePanel: 0 | 1;
  }>({
    mode: "table",
    panels: [
      { path: "/", selected: [] },
      { path: "/", selected: [] },
    ],
    activePanel: 0,
  });
  const data = useMemo(() => {
    const entries = new Map<string, IEntity>();
    for (const file of files) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const id = `/${parts.slice(0, i).join("/")}`;
        entries.set(id, { id, type: "folder" });
      }
      entries.set(`/${file.path}`, {
        id: `/${file.path}`,
        type: file.kind === "directory" ? "folder" : "file",
        size: file.kind === "file" ? file.content.size : undefined,
        date: new Date(file.updatedAt),
      });
    }
    return [...entries.values()];
  }, [files]);
  const fileIcons = useMemo(
    () =>
      new Map<string, string>(
        files.flatMap((file) => {
          if (file.kind !== "file") return [];
          const icon = flowIds.has(file.id)
            ? chatFlowIds.has(file.id)
              ? chatFlowFileIcon
              : flowFileIcon
            : /\.(?:js|mjs|cjs)$/i.test(file.path)
              ? scriptFileIcon
              : undefined;
          return icon ? [[`/${file.path}`, icon] as const] : [];
        }),
      ),
    [files, flowIds, chatFlowIds],
  );
  // SVAR caches cell icons on mount; refresh only when file classifications change.
  const iconKey = JSON.stringify([...fileIcons].sort(([a], [b]) => a.localeCompare(b)));
  const initialize = useCallback((instance: IApi) => {
    api.current = instance;
    const saveView = () => {
      const state = instance.getState();
      view.current = {
        mode: state.mode ?? "table",
        activePanel: state.activePanel ?? 0,
        panels: (state.panels ?? []).map((p) => ({
          path: p.path ?? "/",
          selected: [...(p.selected ?? [])],
        })),
      };
    };
    for (const event of ["set-mode", "set-path", "set-active-panel", "select-file"] as const)
      instance.on(event, saveView);
    const mutate = async (mutation: FileMutation) => {
      await latest.current.onMutation(mutation);
      return false;
    };
    instance.intercept("create-file", (value) => mutate({ type: "create", value }));
    instance.intercept("rename-file", (value) => mutate({ type: "rename", value }));
    instance.intercept("copy-files", (value) => mutate({ type: "copy", value }));
    instance.intercept("move-files", (value) => mutate({ type: "move", value }));
    instance.intercept("delete-files", (value) => mutate({ type: "delete", value }));
    instance.intercept("open-file", ({ id }) => {
      if (!latest.current.locked) latest.current.onAction("open", id.slice(1));
      return false;
    });
    instance.intercept("download-file", ({ id }) => {
      if (!latest.current.locked) latest.current.onAction("download", id.slice(1));
      return false;
    });
  }, []);
  const currentDirectory = () => {
    const state = api.current?.getState();
    return state?.panels?.[state.activePanel ?? 0]?.path?.slice(1) ?? "";
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Delegated propagation guard, not an interactive control; native children handle keyboard activation.
    <section
      className="workspace-browser"
      aria-label={tr("文件列表")}
      aria-busy={locked}
      inert={locked}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        // SVAR portals the New menu outside its narrow sidebar. Keep these
        // clicks away from the sidebar's document-level outside-click listener;
        // native button/menu handlers have already run before this bubble phase.
        if (target.closest(".wx-sidebar, .workspace-create-option")) event.stopPropagation();
      }}
      onClickCapture={(event) => {
        const instance = api.current;
        if (
          !instance ||
          locked ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        const touch = (event.nativeEvent as PointerEvent).pointerType === "touch";
        if (!touch && event.currentTarget.clientWidth >= 768) return;
        const target = event.target as HTMLElement;
        // Keep menus, column resizing and selection controls on their native paths.
        if (target.closest("[data-action-id], button, input, .wx-grip")) return;
        const list = target.closest<HTMLElement>(".wx-list, .wx-cards");
        if (!list) return;
        const id = target.closest<HTMLElement>("[data-id]")?.dataset.id?.replace(/^:/, "");
        if (!id || id === "body") return;
        const state = instance.getState();
        const lists = [...event.currentTarget.querySelectorAll(".wx-list, .wx-cards")];
        const panel =
          lists.length === 2 ? (lists.indexOf(list) as 0 | 1) : (state.activePanel ?? 0);
        const path = state.panels?.[panel]?.path ?? "/";
        const destination =
          id === "/wx-filemanager-parent-link"
            ? path.slice(0, path.lastIndexOf("/")) || "/"
            : instance.getFile(id)?.type === "folder"
              ? id
              : null;
        if (!destination) return;
        event.preventDefault();
        event.stopPropagation();
        void instance.exec("set-path", { id: destination, panel });
      }}
    >
      <Willow>
        <Locale words={i18n.language === "en" ? en : chinese}>
          <Filemanager
            key={iconKey}
            data={data}
            mode={view.current.mode}
            panels={view.current.panels}
            activePanel={view.current.activePanel}
            icons={(file) => fileIcons.get(file.id ?? "") ?? false}
            init={initialize}
            menuOptions={(mode, item) => {
              const options: IFileMenuOption[] = getMenuOptions(mode).map((option) => ({
                ...option,
              }));
              const custom = (
                id: string,
                text: string,
                icon: string,
                handler: () => void,
              ): IFileMenuOption => ({
                id,
                text: tr(text),
                icon,
                handler: () => {
                  if (!locked) handler();
                },
              });
              const separator = (): IFileMenuOption => ({ comp: "separator" });
              if (mode === "add" || mode === "body") {
                // Use the loaded Willow icon set, including native add/upload items.
                const icons: Record<string, string> = {
                  "add-file": "wxi-file",
                  "add-folder": "wxi-folder",
                  upload: "wxi-upload",
                };
                const nativeOptions = getMenuOptions("add").map((option) => {
                  const decorated = { ...option, icon: icons[option.id ?? ""] ?? option.icon };
                  if (option.id !== "add-file" && option.id !== "add-folder") return decorated;
                  const type = option.id === "add-folder" ? "folder" : "file";
                  // Both entry points use the same public SVAR modal and create event.
                  return {
                    ...decorated,
                    id: `workspace-${option.id}`,
                    handler: () => {
                      if (locked) return;
                      setCreationName("");
                      setCreationError(false);
                      setCreation({ type, parent: `/${currentDirectory()}` });
                    },
                  };
                });
                return [
                  custom("new-flow", "新建流程", "wxi-subtask", () =>
                    latest.current.onCreateFlow(currentDirectory()),
                  ),
                  ...nativeOptions.filter((option) => option.id !== "upload"),
                  separator(),
                  ...nativeOptions.filter((option) => option.id === "upload"),
                  custom("import-folder", "导入文件夹", "wxi-folder", () =>
                    latest.current.onImportFolder(currentDirectory()),
                  ),
                  separator(),
                  ...(mode === "body" ? [...options, separator()] : []),
                  custom("export-directory", "下载当前目录", "wxi-download", () =>
                    onAction("download", currentDirectory()),
                  ),
                ].map((option) => ({
                  ...option,
                  css: mode === "add" ? "workspace-create-option" : undefined,
                }));
              }
              if (item && (mode === "file" || mode === "folder")) {
                const path = item.id.slice(1);
                const opening = [
                  custom("open-editor", "打开", "wxi-external", () =>
                    item.type === "folder"
                      ? void api.current?.exec("set-path", { id: item.id })
                      : onAction("open", path),
                  ),
                ];
                if (files.some((f) => f.path === path && flowIds.has(f.id)))
                  opening.push(
                    custom("source", "源码", "wxi-file", () => onAction("source", path)),
                    custom("metadata", "名称与说明", "wxi-information-outline", () =>
                      onAction("metadata", path),
                    ),
                  );
                if (files.some((file) => file.path === path && chatFlowIds.has(file.id)))
                  opening.unshift(
                    custom("new-chat", "新对话", "workspace-chat-menu-icon", () =>
                      onAction("new-chat", path),
                    ),
                  );
                const download =
                  options.find((option) => option.id === "download") ??
                  custom("export-folder", "下载", "wxi-download", () => onAction("download", path));
                return [
                  ...opening,
                  separator(),
                  download,
                  ...options.filter((option) => option.id !== "download"),
                ];
              }
              return options;
            }}
          />
          {creation && (
            <Modal
              title={tr(creation.type === "folder" ? "输入文件夹名称" : "输入文件名")}
              onCancel={() => setCreation(null)}
              onConfirm={() => {
                const name = creationName.trim();
                if (!name) {
                  setCreationError(true);
                  return;
                }
                void api.current?.exec("create-file", {
                  file: { name, type: creation.type, size: 0, date: new Date() },
                  parent: creation.parent,
                });
                setCreation(null);
              }}
            >
              <Text
                focus
                select
                error={creationError}
                value={creationName}
                onChange={({ value }) => setCreationName(String(value))}
              />
            </Modal>
          )}
        </Locale>
      </Willow>
    </section>
  );
}
