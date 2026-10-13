import type { RuntimeFunction } from "agent-plan-core";

export interface ChatExecution {
  id: string;
  threadId: string;
  messageIndex: number;
  status: "running" | "completed" | "failed";
  snapshots: boolean;
  entries: ExecutionEntry[];
  dropped: number;
}
export interface ExecutionEntry {
  id?: string;
  label: string;
  status: "running" | "completed" | "failed";
  ms: number;
  input?: string;
  output?: string;
  error?: string;
  before?: string;
  after?: string;
}

// Bounded traversal avoids serializing a complete conversation before truncation.
export function executionSummary(value: unknown, limit = 2000): string {
  let remaining = limit;
  const seen = new WeakSet<object>();
  function visit(item: unknown, depth: number): unknown {
    if (remaining <= 0 || depth > 5) return "[truncated]";
    if (typeof item === "string") {
      const text = item.slice(0, Math.max(0, remaining));
      remaining -= text.length;
      return text.length < item.length ? `${text} [truncated]` : text;
    }
    remaining -= 16;
    if (item === undefined) return "[undefined]";
    if (item === null || typeof item !== "object") return String(item);
    if (seen.has(item)) return "[shared or circular]";
    seen.add(item);
    const target = Object.getOwnPropertyDescriptor(item, "target");
    const environmentWrite =
      target && "value" in target && ["env.set", "env.override"].includes(target.value);
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const key in item) {
      if (!Object.hasOwn(item, key)) continue;
      if (++count > 30 || remaining <= 0) {
        result["…"] = "[truncated]";
        break;
      }
      remaining -= key.length;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      result[key.slice(0, 100)] =
        environmentWrite && key === "inputs"
          ? "[sensitive]"
          : descriptor && "value" in descriptor
            ? visit(descriptor.value, depth + 1)
            : "[accessor]";
    }
    return result;
  }
  try {
    const text = JSON.stringify(visit(value, 0), null, 2);
    return text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text;
  } catch {
    return "[unavailable]";
  }
}

export function appendExecution(run: ChatExecution, entry: ExecutionEntry) {
  entry.id = crypto.randomUUID();
  run.entries.push(entry);
  while (run.entries.length > 100 || JSON.stringify(run.entries).length > 128_000) {
    run.entries.shift();
    run.dropped++;
  }
}

export function retainExecutions(runs: ChatExecution[]): ChatExecution[] {
  const kept = runs.slice(-8);
  while (kept.length > 1 && JSON.stringify(kept).length > 512_000) kept.shift();
  return kept;
}

/** Mutate the shared registry so nested tools.execute calls are observed too. */
export function observeChatTools(
  registry: Record<string, RuntimeFunction>,
  run: ChatExecution,
  publish: () => void,
  hideValues: () => boolean = () => false,
) {
  for (const [name, original] of Object.entries(registry)) {
    const wrapped: RuntimeFunction = async (input) => {
      const privateInput =
        ["env.set", "env.override"].includes(name) ||
        (name === "tools.execute" &&
          Array.isArray(input.calls) &&
          input.calls.some((call) => ["env.set", "env.override"].includes(call?.target)));
      const entry: ExecutionEntry = {
        label: name,
        status: "running",
        ms: 0,
        input: hideValues() || privateInput ? "[sensitive]" : executionSummary(input),
      };
      appendExecution(run, entry);
      publish();
      const start = performance.now();
      try {
        const output = await original(input);
        entry.output =
          hideValues() || name === "env.get" ? "[sensitive]" : executionSummary(output);
        entry.status = "completed";
        return output;
      } catch (cause) {
        entry.status = "failed";
        entry.error =
          hideValues() || privateInput ? "[sensitive error]" : String(cause).slice(0, 2000);
        throw cause;
      } finally {
        entry.ms = Math.round(performance.now() - start);
        publish();
      }
    };
    if (original.definition)
      Object.defineProperty(wrapped, "definition", { value: original.definition });
    registry[name] = wrapped;
  }
  return registry;
}
