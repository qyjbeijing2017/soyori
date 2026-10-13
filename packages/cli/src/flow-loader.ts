import type { LoadedFlow } from "soyori-core";
import { loadFlowDocument } from "./flow-file.js";
import { resolveSource } from "./flow-source.js";
import { CliError } from "./protocol.js";

/** Link by canonical source, registering each node before loading its dependencies. */
export async function loadFlowGraph(
  entry: string,
  additional: readonly string[] = [],
): Promise<LoadedFlow> {
  const cache = new Map<string, LoadedFlow>();
  const pending: { flow: LoadedFlow; imports: Map<string, LoadedFlow> }[] = [];
  const register = async (source: string): Promise<LoadedFlow> => {
    const previous = cache.get(source);
    if (previous) return previous;
    const document = await loadFlowDocument(source);
    const redirected = cache.get(document.source);
    if (redirected) {
      cache.set(source, redirected);
      return redirected;
    }
    if (pending.length >= 256)
      throw new CliError("IMPORT_LIMIT", "Flow graph exceeds 256 documents.");
    const imports = new Map<string, LoadedFlow>();
    const flow: LoadedFlow = { ...document, imports };
    cache.set(source, flow);
    cache.set(document.source, flow);
    pending.push({ flow, imports });
    return flow;
  };
  const root = await register(await resolveSource(entry));
  const extras = new Map<string, string>();
  for (const assignment of additional) {
    const separator = assignment.indexOf("=");
    if (separator < 1 || !assignment.slice(separator + 1).trim())
      throw new CliError("INVALID_IMPORT", "--flows requires key=source.");
    const key = assignment.slice(0, separator);
    if (extras.has(key) || Object.hasOwn(root.definition.imports ?? {}, key))
      throw new CliError("INVALID_IMPORT", `Duplicate root import: ${key}`);
    extras.set(key, assignment.slice(separator + 1));
  }
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index]!;
    const references = Object.entries(item.flow.definition.imports ?? {});
    if (item.flow === root) references.push(...extras);
    for (const [key, reference] of references) {
      const source = await resolveSource(reference, item.flow.source);
      item.imports.set(key, await register(source));
    }
  }
  return root;
}
