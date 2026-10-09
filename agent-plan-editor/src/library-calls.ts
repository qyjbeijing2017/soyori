import {
  type FlowDefinition,
  type JsonValue,
  type LoadedFlow,
  parseFlow,
  type Step,
} from "agent-plan-core";
import { tools } from "./call-tools.ts";
import { tr } from "./i18n.ts";
import type { FlowDocument } from "./library";

export interface CallChoice {
  alias: string;
  label: string;
  source: string;
  flow?: FlowDefinition;
  unavailable?: boolean;
  current?: boolean;
}
export function libraryChoices(
  flow: FlowDefinition,
  documents: FlowDocument[],
  currentDocumentId?: string,
): CallChoice[] {
  const choices: CallChoice[] = [];
  const used = new Set([...Object.keys(tools), ...Object.keys(flow.imports ?? {})]);
  for (const [alias, source] of Object.entries(flow.imports ?? {})) {
    const doc = documents.find((d) => `library:${d.id}` === source);
    choices.push({
      alias,
      source,
      label: doc
        ? `${doc.flow.name}${alias === doc.flow.name ? "" : ` (${alias})`}`
        : `${alias} (${tr("不可用")})`,
      flow: doc?.flow,
      unavailable: !doc || Object.hasOwn(tools, alias),
    });
  }
  for (const doc of documents) {
    const source = `library:${doc.id}`;
    if (choices.some((c) => c.source === source) || Object.hasOwn(tools, doc.flow.name)) continue;
    let alias = doc.flow.name;
    for (let suffix = 2; used.has(alias); suffix++) alias = `${doc.flow.name} (${suffix})`;
    used.add(alias);
    choices.push({ alias, label: alias, source, flow: doc.flow });
  }
  return choices.map((choice) =>
    currentDocumentId && choice.source === `library:${currentDocumentId}`
      ? { ...choice, current: true }
      : choice,
  );
}
export function bindLibraryCalls(flow: FlowDefinition, choices: CallChoice[]): FlowDefinition {
  const imports = { ...flow.imports };
  const visit = (steps: Step[]) => {
    for (const step of steps) {
      if (
        step.type === "call" &&
        !Object.hasOwn(imports, step.target) &&
        !Object.hasOwn(tools, step.target)
      ) {
        const choice = choices.find((c) => c.alias === step.target && !c.unavailable);
        if (choice)
          Object.defineProperty(imports, step.target, {
            value: choice.source,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
      if (step.type === "if") {
        visit(step.then);
        visit(step.else ?? []);
      }
      if (step.type === "while") visit(step.body);
      if (step.type === "group") visit(step.steps);
    }
  };
  visit(flow.steps);
  return Object.keys(imports).length ? { ...flow, imports } : flow;
}

export function loadLibraryGraph(root: FlowDocument, documents: FlowDocument[]): LoadedFlow {
  const registry = new Map(documents.map((doc) => [doc.id, doc]));
  registry.set(root.id, root);
  const cache = new Map<string, LoadedFlow>();
  const load = (id: string): LoadedFlow => {
    const prior = cache.get(id);
    if (prior) return prior;
    const doc = registry.get(id);
    if (!doc) throw Error(tr("被调用的流程已不存在：{{name}}", { name: id }));
    if (cache.size >= 256) throw Error(tr("流程依赖超过 256 个"));
    const imports = new Map<string, LoadedFlow>();
    const node = { definition: parseFlow(doc.flow), imports, source: `library:${id}` };
    cache.set(id, node);
    for (const [alias, source] of Object.entries(node.definition.imports ?? {})) {
      if (!source.startsWith("library:"))
        throw Error(tr("浏览器暂不支持外部流程：{{name}}", { name: source }));
      imports.set(alias, load(source.slice(8)));
    }
    return node;
  };
  return load(root.id);
}

// Upgrade only persisted browser documents; Core and file imports use the new protocol.
export function migrateCallTargets(flow: FlowDefinition): FlowDefinition {
  let changed = false;
  const copy = structuredClone(flow);
  const visit = (steps: Step[]) => {
    for (const step of steps) {
      if (step.type === "call" && typeof step.target === "object" && step.target !== null) {
        const target = step.target as { kind?: string; key?: string; id?: string };
        const name =
          target.kind === "flow" ? target.key : target.kind === "function" ? target.id : undefined;
        if (typeof name === "string" && Object.keys(target).length === 2) {
          step.target = name;
          changed = true;
        }
      }
      if (step.type === "if") {
        visit(step.then);
        visit(step.else ?? []);
      }
      if (step.type === "while") visit(step.body);
      if (step.type === "group") visit(step.steps);
    }
  };
  visit(copy.steps);
  return changed ? copy : flow;
}

/** Defaults are literal data; call operands must escape dollar-prefixed strings recursively. */
export function defaultOperand(value: JsonValue): JsonValue {
  if (typeof value === "string") return value.startsWith("$") ? `$${value}` : value;
  if (Array.isArray(value)) return value.map(defaultOperand);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, defaultOperand(item)]),
    );
  return value;
}
