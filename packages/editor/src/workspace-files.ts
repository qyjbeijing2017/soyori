import { unzipSync, zipSync } from "fflate";
import { exportFile } from "./export-file.ts";

export interface WorkspaceFile {
  id: string;
  path: string;
  kind: "file" | "directory";
  content: Blob;
  updatedAt: string;
}
export function filePath(input: string): string {
  const path = input.replace(/\\/g, "/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes(":") ||
    Array.from(path).some((char) => char.charCodeAt(0) < 32) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error(`Invalid workspace path: ${input}`);
  return path;
}
export function workspaceURL(path: string) {
  return `workspace:/${filePath(path).split("/").map(encodeURIComponent).join("/")}`;
}
export function pathFromURL(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "workspace:" || parsed.host || parsed.search || parsed.hash)
    throw Error(`Invalid workspace URL: ${url}`);
  return filePath(decodeURIComponent(parsed.pathname.slice(1)));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, result: (v: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("agent-plan-workspace", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("files", { keyPath: "path" });
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(Error("Workspace database is blocked by another tab."));
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      const tx = db.transaction("files", mode);
      let value: T;
      let failure: Error | undefined;
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onabort = () => {
        db.close();
        reject(failure ?? tx.error ?? Error("Workspace transaction aborted."));
      };
      try {
        action(
          tx.objectStore("files"),
          (v) => {
            value = v;
          },
          (error) => {
            failure = error;
            tx.abort();
          },
        );
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
  });
}
export function listFiles(): Promise<WorkspaceFile[]> {
  return transaction("readonly", (store, result) => {
    const request = store.getAll();
    request.onsuccess = () => result(request.result);
  });
}
export function readFile(path: string): Promise<WorkspaceFile | undefined> {
  return transaction("readonly", (store, result) => {
    const request = store.get(filePath(path));
    request.onsuccess = () => result(request.result);
  });
}
/** Atomic batch, preserving bytes and existing IDs. Conflicts never silently overwrite. */
export async function writeFiles(
  files: WorkspaceFile[],
  replace = false,
  revisions?: Record<string, string>,
) {
  const paths = new Set<string>();
  for (const file of files) {
    file.path = filePath(file.path);
    if (paths.has(file.path)) throw Error(`Duplicate path: ${file.path}`);
    paths.add(file.path);
  }
  return transaction<void>("readwrite", (store, result, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = request.result as WorkspaceFile[];
      const combined = new Map(existing.map((f) => [f.path, f]));
      for (const file of files) {
        const previous = combined.get(file.path);
        if (
          revisions &&
          previous &&
          revisions[file.path] !== `${previous.id}:${previous.updatedAt}`
        ) {
          fail(Error(`WORKSPACE_CONFLICT: File changed: ${file.path}`));
          return;
        }
        if (revisions && !previous && revisions[file.path]) {
          fail(Error(`WORKSPACE_CONFLICT: File removed: ${file.path}`));
          return;
        }
        if (previous && (!replace || previous.kind !== file.kind || previous.id !== file.id)) {
          store.transaction.abort();
          return;
        }
        combined.set(file.path, file);
      }
      for (const file of combined.values()) {
        const parts = file.path.split("/");
        for (let i = 1; i < parts.length; i++) {
          if (combined.get(parts.slice(0, i).join("/"))?.kind === "file") {
            store.transaction.abort();
            return;
          }
        }
      }
      for (const file of files) store.put(file);
      result(undefined);
    };
  });
}
export function newFile(
  path: string,
  content = new Blob(),
  kind: "file" | "directory" = "file",
): WorkspaceFile {
  return {
    id: crypto.randomUUID(),
    path: filePath(path),
    kind,
    content,
    updatedAt: new Date().toISOString(),
  };
}
export async function moveFile(path: string, destination: string) {
  path = filePath(path);
  destination = filePath(destination);
  if (path === destination) return;
  if (destination.startsWith(`${path}/`)) throw Error("Cannot move a folder into itself.");
  return transaction<void>("readwrite", (store, result) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as WorkspaceFile[];
      const moving = all.filter((f) => f.path === path || f.path.startsWith(`${path}/`));
      const others = all.filter((f) => !moving.includes(f));
      const changed = moving.map((f) => ({
        ...f,
        path: destination + f.path.slice(path.length),
        updatedAt: new Date().toISOString(),
      }));
      const combined = [...others, ...changed];
      if (
        !moving.length ||
        new Set(combined.map((f) => f.path)).size !== combined.length ||
        combined.some((f) =>
          combined.some((p) => p.kind === "file" && f.path.startsWith(`${p.path}/`)),
        )
      ) {
        store.transaction.abort();
        return;
      }
      for (const file of moving) store.delete(file.path);
      for (const file of changed) store.put(file);
      result(undefined);
    };
  });
}
export function removeFile(path: string) {
  path = filePath(path);
  return transaction<void>("readwrite", (store, result) => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      for (const key of request.result)
        if (key === path || String(key).startsWith(`${path}/`)) store.delete(key);
      result(undefined);
    };
  });
}
/** Native file-manager operations commit the whole selection together. */
export async function changeFiles(
  operation: "copy" | "move" | "delete",
  paths: string[],
  target = "",
) {
  const sources = [...new Set(paths.map(filePath))].filter(
    (path, _, all) => !all.some((parent) => parent !== path && path.startsWith(`${parent}/`)),
  );
  if (target) target = filePath(target);
  if (operation !== "delete" && sources.some((p) => target === p || target.startsWith(`${p}/`)))
    throw Error("Cannot place a folder into itself.");
  return transaction<void>("readwrite", (store, result, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as WorkspaceFile[];
      const selected = all.filter((f) =>
        sources.some((p) => f.path === p || f.path.startsWith(`${p}/`)),
      );
      const remaining = operation === "copy" ? all : all.filter((f) => !selected.includes(f));
      const destinations = new Map<string, string>();
      const occupied = new Set(
        remaining.flatMap((f) => {
          const parts = f.path.split("/");
          return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
        }),
      );
      for (const source of sources) {
        if (!selected.some((f) => f.path === source || f.path.startsWith(`${source}/`))) {
          fail(Error(`Source no longer exists: ${source}`));
          return;
        }
        const name = source.split("/").at(-1)!;
        const prefix = target ? `${target}/` : "";
        let destination = prefix + name;
        if (operation === "copy") {
          const isFile = all.find((f) => f.path === source)?.kind === "file";
          const dot = isFile ? name.lastIndexOf(".") : -1;
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const extension = dot > 0 ? name.slice(dot) : "";
          for (let number = 2; occupied.has(destination); number++)
            destination = `${prefix}${stem} (${number})${extension}`;
        } else if (operation === "move" && occupied.has(destination)) {
          fail(Error(`Destination already exists: ${destination}`));
          return;
        }
        destinations.set(source, destination);
        occupied.add(destination);
      }
      const changed =
        operation === "delete"
          ? []
          : selected.map((f) => {
              const source = sources.find((p) => f.path === p || f.path.startsWith(`${p}/`))!;
              const destination = destinations.get(source)!;
              return {
                ...f,
                id: operation === "copy" ? crypto.randomUUID() : f.id,
                path: destination + f.path.slice(source.length),
                updatedAt: new Date().toISOString(),
              };
            });
      const combined = [...remaining, ...changed];
      if (
        new Set(combined.map((f) => f.path)).size !== combined.length ||
        combined.some((f) =>
          combined.some((p) => p.kind === "file" && f.path.startsWith(`${p.path}/`)),
        )
      ) {
        fail(Error(`Destination conflicts with an existing file: ${target || "/"}`));
        return;
      }
      if (operation !== "copy") for (const f of selected) store.delete(f.path);
      for (const f of changed) store.put(f);
      result(undefined);
    };
  });
}
export async function importWorkspace(files: FileList | File[], directory = "", unpack = false) {
  const incoming: WorkspaceFile[] = [];
  let total = 0;
  for (const file of Array.from(files)) {
    total += file.size;
    if (total > 100 * 1024 * 1024) throw Error("Import exceeds 100 MiB.");
    const path = `${directory ? `${directory}/` : ""}${file.webkitRelativePath || file.name}`;
    if (unpack && /\.(?:soyori|agentp)\.zip$/i.test(file.name))
      incoming.push(...(await archiveFiles(file, directory)));
    else incoming.push(newFile(path, file));
  }
  if (
    incoming.length > 5000 ||
    incoming.reduce((size, file) => size + file.content.size, 0) > 100 * 1024 * 1024
  )
    throw Error("Expanded import exceeds 100 MiB or 5000 entries.");
  await writeFiles(incoming);
}
async function archiveFiles(file: File, directory = "") {
  const prefix = directory ? `${filePath(directory)}/` : "";
  if (file.size > 100 * 1024 * 1024) throw Error("Archive exceeds 100 MiB.");
  let total = 0;
  let count = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (++count > 5000) throw Error("Archive exceeds 5000 entries.");
      filePath(entry.name.replace(/\/$/, ""));
      total += entry.originalSize;
      if (total > 100 * 1024 * 1024) throw Error("Expanded archive exceeds 100 MiB.");
      return true;
    },
  });
  if (Object.keys(entries).length > 5000) throw Error("Archive exceeds 5000 entries.");
  return Object.entries(entries).map(([path, bytes]) =>
    newFile(
      prefix + path.replace(/\/$/, ""),
      new Blob([bytes as BlobPart]),
      path.endsWith("/") ? "directory" : "file",
    ),
  );
}
export async function importArchive(file: File, directory = "") {
  await writeFiles(await archiveFiles(file, directory));
}
export function downloadBlob(content: Blob, name: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportWorkspace(directory = "") {
  if (directory) directory = filePath(directory);
  const parent = directory.split("/").slice(0, -1).join("/");
  const offset = parent ? parent.length + 1 : 0;
  const entries: Record<string, Uint8Array> = {};
  for (const file of await listFiles()) {
    if (directory && file.path !== directory && !file.path.startsWith(`${directory}/`)) continue;
    Object.defineProperty(
      entries,
      file.path.slice(directory ? offset : 0) + (file.kind === "directory" ? "/" : ""),
      {
        value: new Uint8Array(await (await exportFile(file.content, file.path)).arrayBuffer()),
        enumerable: true,
      },
    );
  }
  return new Blob([zipSync(entries) as BlobPart], { type: "application/zip" });
}
