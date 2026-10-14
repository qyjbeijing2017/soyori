import { type FlowDefinition, keyedFields, parseFlow, type Step } from "soyori-core";
import { createBrowserStorage } from "soyori-storage/browser";
import { stringify } from "yaml";
import { tools } from "./call-tools.ts";
import { upgradeDefaultChat } from "./chat-contract.ts";
import example from "./example.json" with { type: "json" };
import { readFlowFile } from "./flow-files.ts";
import { tr } from "./i18n.ts";
import { migrateCallTargets } from "./library-calls.ts";
import { listFiles, newFile, readFile, removeFile, writeFiles } from "./workspace-files.ts";

export { canChat } from "./chat-contract.ts";

export interface FlowDocument {
  id: string;
  flow: FlowDefinition;
  updatedAt: string;
  path?: string;
}
const storage = createBrowserStorage("agent-plan-library");
export function makeDocument(flow: FlowDefinition, id: string = crypto.randomUUID()): FlowDocument {
  const definition = parseFlow(flow);
  definition.fields = keyedFields(definition.fields);
  return { id, flow: definition, updatedAt: new Date().toISOString() };
}
let saveQueue: Promise<unknown> = Promise.resolve();
export function flowFilename(name: string): string {
  const stem = Array.from(name.trim())
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? "_" : char))
    .join("");
  return `${stem || "flow"}.yaml`;
}
export async function saveDocument(doc: FlowDocument, directory = "") {
  const save = async () => {
    const name = doc.flow.name.trim();
    if (Object.hasOwn(tools, name)) throw Error(tr("流程名称不能与内置工具重名"));
    const valid = makeDocument({ ...doc.flow, name }, doc.id);
    for (const other of await loadFileDocuments()) {
      if (other.id !== doc.id && other.flow.name.trim() === name)
        throw Error(tr("已存在名为「{{name}}」的流程，请使用其他名称。", { name }));
    }
    const files = await listFiles();
    const existing = files.find((file) => file.id === doc.id);
    const path =
      existing?.path ?? doc.path ?? `${directory ? `${directory}/` : ""}${flowFilename(name)}`;
    const flow = portableFlow(valid.flow, files, path);
    const content = new Blob([
      /\.json$/i.test(path) ? JSON.stringify(flow, null, 2) : stringify(flow, { lineWidth: 0 }),
    ]);
    await writeFiles([{ ...newFile(path, content), id: doc.id }], Boolean(existing));
    valid.flow = flow;
    valid.path = path;
    return valid;
  };
  // Serialize the check and write, including concurrent tabs where Web Locks is available.
  const task = saveQueue
    .catch(() => {})
    .then(() =>
      globalThis.navigator?.locks
        ? navigator.locks.request("agent-plan-library-save", save)
        : save(),
    );
  saveQueue = task;
  return task;
}
function portableFlow(
  flow: FlowDefinition,
  files: Awaited<ReturnType<typeof listFiles>>,
  parent: string,
) {
  if (!flow.imports) return flow;
  return {
    ...flow,
    imports: Object.fromEntries(
      Object.entries(flow.imports).map(([alias, source]) => {
        const file = source.startsWith("library:")
          ? files.find((f) => f.id === source.slice(8))
          : undefined;
        const target =
          file?.path ?? (source.startsWith("/") ? decodeURIComponent(source.slice(1)) : undefined);
        if (!target) return [alias, source];
        const from = parent.split("/").slice(0, -1),
          to = target.split("/");
        while (from.length && to.length && from[0] === to[0]) {
          from.shift();
          to.shift();
        }
        return [
          alias,
          `${from.length ? "../".repeat(from.length) : "./"}${to.map(encodeURIComponent).join("/")}`,
        ];
      }),
    ),
  };
}
async function loadFileDocuments(): Promise<FlowDocument[]> {
  const docs: FlowDocument[] = [];
  for (const file of await listFiles()) {
    if (file.kind !== "file" || !/\.(json|ya?ml)$/i.test(file.path)) continue;
    try {
      docs.push({
        id: file.id,
        path: file.path,
        updatedAt: file.updatedAt,
        flow: readFlowFile(await file.content.text(), file.path),
      });
    } catch {
      /* Ordinary JSON/YAML and invalid flows remain available as files. */
    }
  }
  return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function initializeWorkspace() {
  const { found } = await storage.read("meta/workspace-migrated");
  if (!found) {
    const { keys } = await storage.list("flows/");
    const migrated = [];
    for (const key of keys) {
      const { value } = await storage.read(key);
      const record = value as unknown as FlowDocument;
      const flow = upgradeDefaultChat(parseFlow(migrateCallTargets(record.flow)));
      const path = `flows/${record.id}.yaml`;
      if (!(await readFile(path)))
        migrated.push({ ...newFile(path, new Blob([stringify(flow)])), id: record.id });
    }
    if (migrated.length) await writeFiles(migrated);
    const files = await listFiles();
    for (const doc of await loadFileDocuments()) {
      const converted = portableFlow(doc.flow, files, doc.path!);
      if (converted !== doc.flow) {
        const file = files.find((f) => f.id === doc.id)!;
        await writeFiles(
          [
            {
              ...file,
              content: new Blob([
                /\.json$/i.test(file.path)
                  ? JSON.stringify(converted, null, 2)
                  : stringify(converted),
              ]),
            },
          ],
          true,
        );
      }
    }
    const initialized = await storage.read("meta/initialized");
    if (!keys.length && !files.length && !initialized.found)
      await saveDocument(makeDocument(parseFlow(example), "local-agent"));
    await storage.write("meta/workspace-migrated", true);
    await storage.write("meta/initialized", true);
  }
}
let initialization: Promise<void> | undefined;
export async function loadLibrary(): Promise<FlowDocument[]> {
  initialization ??= (
    globalThis.navigator?.locks
      ? navigator.locks.request("agent-plan-workspace-init", initializeWorkspace)
      : initializeWorkspace()
  ).catch((error) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return loadFileDocuments();
}
export async function deleteDocument(id: string) {
  const file = (await listFiles()).find((file) => file.id === id);
  if (file) await removeFile(file.path);
}
export function usesLocalModel(steps: Step[]): boolean {
  return steps.some((step) =>
    step.type === "call"
      ? step.target === "llm.local"
      : step.type === "if"
        ? usesLocalModel([...step.then, ...(step.else ?? [])])
        : step.type === "while"
          ? usesLocalModel(step.body)
          : false,
  );
}
export function downloadDocument(doc: FlowDocument) {
  const url = URL.createObjectURL(
    new Blob([stringify(doc.flow, { lineWidth: 0 })], { type: "application/yaml;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  const filename = Array.from(doc.flow.name)
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? "_" : char))
    .join("");
  anchor.download = `${filename.slice(0, 100) || "flow"}.yaml`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
