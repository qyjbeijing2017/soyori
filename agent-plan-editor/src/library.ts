import { type FlowDefinition, parseFlow, type Step } from "agent-plan-core";
import { createBrowserStorage } from "agent-plan-storage/browser";
import { stringify } from "yaml";
import { tools } from "./call-tools";
import { upgradeDefaultChat } from "./chat-contract";
import example from "./example.json";
import { tr } from "./i18n";
import { migrateCallTargets } from "./library-calls";

export { canChat } from "./chat-contract";

export interface FlowDocument {
  id: string;
  flow: FlowDefinition;
  updatedAt: string;
}
const storage = createBrowserStorage("agent-plan-library");
export function makeDocument(flow: FlowDefinition, id: string = crypto.randomUUID()): FlowDocument {
  return { id, flow: parseFlow(flow), updatedAt: new Date().toISOString() };
}
let saveQueue: Promise<unknown> = Promise.resolve();
export async function saveDocument(doc: FlowDocument) {
  const save = async () => {
    const name = doc.flow.name.trim();
    if (Object.hasOwn(tools, name)) throw Error(tr("流程名称不能与内置工具重名"));
    const valid = makeDocument({ ...doc.flow, name }, doc.id);
    const { keys } = await storage.list("flows/");
    for (const key of keys) {
      if (key === `flows/${valid.id}`) continue;
      const { value } = await storage.read(key);
      const other = value as unknown as FlowDocument | null;
      if (other?.flow?.name?.trim() === name)
        throw Error(tr("已存在名为「{{name}}」的流程，请使用其他名称。", { name }));
    }
    await storage.write(`flows/${valid.id}`, valid);
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
export async function loadLibrary(): Promise<FlowDocument[]> {
  const { keys } = await storage.list("flows/");
  if (!keys.length) {
    const { found } = await storage.read("meta/initialized");
    if (found) return [];
    const initial = await saveDocument(makeDocument(parseFlow(example), "local-agent"));
    await storage.write("meta/initialized", true);
    return [initial];
  }
  const docs: FlowDocument[] = [];
  for (const key of keys) {
    const { value } = await storage.read(key);
    const record = value as FlowDocument;
    if (
      !record ||
      typeof record.id !== "string" ||
      typeof record.updatedAt !== "string" ||
      key !== `flows/${record.id}`
    )
      throw new Error("流程库记录损坏，请保留站点数据并检查。");
    const migrated = migrateCallTargets(record.flow);
    const flow = parseFlow(migrated);
    const upgraded = upgradeDefaultChat(flow);
    const loaded = { ...record, flow: upgraded };
    // Migrate existing definitions without blocking access to legacy duplicate names.
    if (upgraded !== flow || migrated !== record.flow) await storage.write(key, loaded);
    docs.push(loaded);
  }
  return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function deleteDocument(id: string) {
  // Persist before deleting so an intentionally empty library stays empty on reload.
  await storage.write("meta/initialized", true);
  await storage.delete(`flows/${id}`);
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
