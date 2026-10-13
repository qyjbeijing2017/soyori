import {
  createRuntime,
  fieldDefinitions,
  type LoadedFlow,
  type Runtime,
  type RuntimeFunction,
  redactFailure,
  redactFields,
  type ToolDefinition,
} from "agent-plan-core";

/** Bridge only explicitly imported flows, using Core rather than interpreting steps here. */
export function createToolRegistry(
  base: Record<string, RuntimeFunction>,
  root: LoadedFlow | undefined,
  activeSource: () => string | undefined = () => root?.source,
  signal?: AbortSignal,
) {
  const nodes = new Map<string, LoadedFlow>();
  const seen = new Set<LoadedFlow>();
  function visit(node: LoadedFlow) {
    if (seen.has(node)) return;
    seen.add(node);
    if (node.source) nodes.set(node.source, node);
    for (const child of node.imports.values()) visit(child);
  }
  if (root) visit(root);
  const frames: { runtime: Runtime; flow: LoadedFlow }[] = [];
  let remainingSteps = 2000;
  function source() {
    return frames.at(-1)?.runtime.getStack().at(-1)?.source ?? activeSource();
  }
  function registry(): Record<string, RuntimeFunction> {
    const frame = frames.at(-1);
    const scope = nodes.get(source() ?? "") ?? frame?.flow ?? root;
    if (!scope) return base;
    const imports = Object.fromEntries(
      [...scope.imports].map(([name, flow]) => {
        const fields = Object.entries(fieldDefinitions(flow.definition.fields));
        const definition: ToolDefinition = {
          name,
          ...(flow.definition.description ? { description: flow.definition.description } : {}),
          inputs: fields
            .filter(([, f]) => f.input)
            .map(([name, f]) => ({
              name,
              ...(f.description ? { description: f.description } : {}),
              ...(f.initial === undefined || f.sensitive ? {} : { defaultValue: f.initial }),
            })),
          outputs: fields.filter(([, f]) => f.output).map(([name]) => ({ name })),
        };
        return [
          name,
          Object.assign(
            async (inputs: Record<string, unknown>) => {
              signal?.throwIfAborted();
              if (frames.length >= 8) throw Error("AI_TOOL_BUDGET: Tool flow depth exceeds 8.");
              const runtime = createRuntime(flow, inputs, { functions: base });
              frames.push({ runtime, flow });
              try {
                while (!["completed", "failed"].includes(runtime.getState().status)) {
                  signal?.throwIfAborted();
                  if (--remainingSteps < 0)
                    throw Error("AI_TOOL_BUDGET: Tool flows exceed 2000 steps.");
                  await runtime.step();
                }
                const state = runtime.getState();
                if (state.error)
                  throw Error(redactFailure(state.error, runtime.getSensitiveFields()).message);
                return redactFields(state.output ?? {}, runtime.getSensitiveFields());
              } finally {
                frames.pop();
              }
            },
            { definition },
          ),
        ];
      }),
    );
    // Core resolves imports before host functions.
    return { ...base, ...imports };
  }
  return { registry, source };
}
