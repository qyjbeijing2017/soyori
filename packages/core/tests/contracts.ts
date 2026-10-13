import type {
  CallStep,
  FieldName,
  FieldReference,
  FlowDefinition,
  LoadedFlow,
  Runtime,
  Step,
} from "../dist/index.js";
import { createRuntime } from "../dist/index.js";

const definition = {
  schemaVersion: 1,

  name: "Types",
  description: "Documented flow",
  fields: { result: { initial: { nested: [1] }, input: true, output: true } },
  steps: [{ type: "template", template: "$implicitA$$implicitB$", output: "$result" }],
} satisfies FlowDefinition;

// @ts-expect-error Descriptions are strings rather than arbitrary metadata objects.
const invalidDescription: Step = { type: "set", field: "$x", value: "$y", description: 1 };
void invalidDescription;

const runtime = createRuntime(definition);
const state = runtime.getState();
// @ts-expect-error The live view cannot be modified directly.
state.status = "ready";
// @ts-expect-error Fields must be modified through setFields.
state.fields.result = 1;
const value = state.fields.result;
if (typeof value === "object" && value !== null) {
  // @ts-expect-error Unknown runtime values require narrowing before property access.
  value.nested = [];
}
// @ts-expect-error Raw declaration names remain strings.
const ambiguous: FieldName = { field: "$result", literal: 1 };
// @ts-expect-error Steps do not have identifiers.
const identified: Step = { type: "set", id: "x", field: "$result", value: "$source" };
const inline: Step = { type: "add", left: "$result", right: 1, output: "$result" };
const append: Step = {
  type: "append",
  field: "$result.messages",
  value: { text: "$source", limit: 10 },
};
// @ts-expect-error Destination paths need a $ prefix.
const bareDestination: FieldReference = "result";
void [append, bareDestination];
// @ts-expect-error resetFields is intentionally not part of the runtime API.
runtime.resetFields();
// @ts-expect-error Reset cannot jump to a step.
runtime.reset({}, { startAt: 1 });

function narrow(step: Step): string {
  if (step.type === "while") return String(step.condition);
  if (step.type === "template") return step.output;
  return step.type;
}
void [ambiguous, identified, inline, narrow];

const call: CallStep = {
  type: "call",
  target: "types",
  inputs: { result: "$source" },
  outputs: { result: "$destination" },
};
// @ts-expect-error Whole-object output and mapped outputs are mutually exclusive.
const conflict: CallStep = { ...call, output: "$result" };
const literalCall: CallStep = {
  type: "call",
  target: "types",
  inputs: { result: 1 },
};
const stack: readonly Runtime[] = runtime.getStack();
// @ts-expect-error Consumers may not mutate the scheduler stack.
stack.push(runtime);
// @ts-expect-error Identity is readonly.
runtime.invocationId = "other";
const child: Runtime | undefined = stack.at(-1);
if (child) {
  const childStep: Promise<import("../dist/index.js").StepResult> = child.step();
  void childStep;
}
if (state.error?.callStack?.[0]) {
  // @ts-expect-error Error call-chain locations are readonly.
  state.error.callStack[0].path = "other";
}
void [conflict, literalCall];

runtime.setFields({ result: new Uint8Array([1, 2]) });
runtime.reset({ result: undefined });
const external: CallStep = {
  type: "call",
  target: "echo",
  inputs: { data: "$result" },
  output: "$result",
};
createRuntime(
  { ...definition, steps: [external] },
  { result: new Map() },
  {
    functions: { echo: async ({ data }) => data },
  },
);
const invalidInitial: FlowDefinition = {
  ...definition,
  // @ts-expect-error Definitions remain JSON-serializable even though runtime values are arbitrary.
  fields: { binary: { initial: new Uint8Array([1]) } },
};
void invalidInitial;

const linked: LoadedFlow = { definition, imports: new Map(), source: "memory:types" };
createRuntime(linked);
// @ts-expect-error Global flow registration has been replaced by local linked imports.
createRuntime(definition, {}, { flows: [definition] });
// @ts-expect-error Object call targets are no longer supported.
const oldTarget: CallStep = { type: "call", target: { kind: "flow", key: "types" } };
void oldTarget;
