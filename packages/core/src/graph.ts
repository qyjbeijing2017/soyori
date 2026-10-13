import { RuntimeError } from "./errors.js";
import type { FlowDefinition, LoadedFlow } from "./flow.js";
import { prepareFlow, validateCalls } from "./validation.js";
import { isRecord } from "./values.js";

/** Capture a private graph so host mutations cannot change an active program. */
export function prepareGraph(
  input: FlowDefinition | LoadedFlow,
  functions: ReadonlyMap<string, unknown>,
): LoadedFlow {
  const copies = new Map<object, LoadedFlow>();
  const pending: {
    input: Record<string, unknown>;
    output: LoadedFlow;
    imports: Map<string, LoadedFlow>;
  }[] = [];
  const register = (value: unknown): LoadedFlow => {
    if (!isRecord(value))
      throw new RuntimeError("INVALID_FLOW", "Expected a loaded flow or flow definition.");
    const prior = copies.get(value);
    if (prior) return prior;
    const linked = Object.hasOwn(value, "definition");
    const source = linked ? value.source : undefined;
    if (source !== undefined && typeof source !== "string")
      throw new RuntimeError("INVALID_FLOW", "Source must be a string.");
    const imports = new Map<string, LoadedFlow>();
    try {
      const definition = prepareFlow(linked ? value.definition : value);
      const output: LoadedFlow = {
        definition,
        imports,
        ...(source === undefined ? {} : { source }),
      };
      copies.set(value, output);
      if (linked) pending.push({ input: value, output, imports });
      return output;
    } catch (error) {
      if (error instanceof RuntimeError && source !== undefined) error.source = source;
      throw error;
    }
  };
  const root = register(input);
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index]!;
    if (!(item.input.imports instanceof Map))
      throw new RuntimeError("INVALID_FLOW", "Loaded imports must be a Map.");
    for (const [key, target] of item.input.imports) {
      if (typeof key !== "string" || !key)
        throw new RuntimeError("INVALID_FLOW", "Import alias must be a nonempty string.");
      item.imports.set(key, register(target));
    }
  }
  for (const flow of copies.values()) {
    try {
      validateCalls(flow, functions);
    } catch (error) {
      if (error instanceof RuntimeError) {
        error.flowName = flow.definition.name;
        if (flow.source !== undefined) error.source = flow.source;
      }
      throw error;
    }
  }
  return root;
}
