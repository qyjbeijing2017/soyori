import type { RuntimeFailure } from "./errors.js";
import { RuntimeError } from "./errors.js";
import { fieldDefinitions } from "./fields.js";
import type { CallStep, FlowDefinition, LoadedFlow, Operand, Step, WhileStep } from "./flow.js";
import { prepareGraph } from "./graph.js";
import { appendReference, resolveOperand, writeReferences } from "./operands.js";
import type {
  RunState,
  RunStatus,
  Runtime,
  RuntimeFields,
  RuntimeFunction,
  RuntimeOptions,
  StepEvent,
  StepResult,
} from "./runtime-types.js";
import { renderTemplate } from "./template.js";
import { copyJson, equalValues, isRecord, toNumber } from "./values.js";

interface MutableRunState {
  invocationId: string;
  flowName: string;
  source?: string;
  depth: number;
  readonly status: RunStatus;
  readonly busy: boolean;
  fields: RuntimeFields;
  nextStepPath: string | null;
  output?: RuntimeFields;
  error?: RuntimeFailure;
}

interface SequenceFrame {
  kind: "sequence";
  steps: Step[];
  path: string;
  index: number;
}
interface LoopFrame {
  kind: "loop";
  step: WhileStep;
  path: string;
  iterations: number;
}
type Frame = SequenceFrame | LoopFrame;

interface Scheduler {
  id: number;
  generation: number;
  sequence: number;
  busy: boolean;
  stack: FlowRuntime[];
  functions: Map<string, RuntimeFunction>;
  maxIterations: number;
  maxCallDepth: number;
}

interface PendingCall {
  step: CallStep;
  path: string;
  frame: SequenceFrame;
}

let nextSchedulerId = 0;

class FlowRuntime implements Runtime {
  readonly #flow: FlowDefinition;
  readonly #fields: ReturnType<typeof fieldDefinitions>;
  readonly #loaded: LoadedFlow;
  readonly #scheduler: Scheduler;
  readonly #state: MutableRunState;
  readonly #root: boolean;
  #generation: number;
  #status: Exclude<RunStatus, "invalidated"> = "ready";
  #stack: Frame[];
  #pending: PendingCall | undefined;

  constructor(loaded: LoadedFlow, inputs: RuntimeFields, scheduler: Scheduler, root = false) {
    const flow = loaded.definition;
    this.#loaded = loaded;
    this.#flow = flow;
    this.#fields = fieldDefinitions(flow.fields);
    this.#scheduler = scheduler;
    this.#generation = scheduler.generation;
    this.#root = root;
    this.#stack = this.#initialStack();
    const runtime = this;
    this.#state = {
      invocationId: this.#nextId(),
      flowName: flow.name,
      ...(loaded.source === undefined ? {} : { source: loaded.source }),
      depth: scheduler.stack.length + 1,
      get status() {
        return runtime.#generation === scheduler.generation ? runtime.#status : "invalidated";
      },
      get busy() {
        return runtime.#generation === scheduler.generation && scheduler.busy;
      },
      fields: this.#initialFields(inputs),
      nextStepPath: this.#current()?.path ?? null,
    };
  }

  get invocationId(): string {
    return this.#state.invocationId;
  }
  get flowName(): string {
    return this.#flow.name;
  }
  get source(): string | undefined {
    return this.#loaded.source;
  }
  getState(): RunState {
    return this.#state;
  }

  getSensitiveFields(): string[] {
    return Object.entries(fieldDefinitions(this.#flow.fields))
      .filter(([, field]) => field.sensitive === true)
      .map(([name]) => name);
  }

  getStack(): readonly Runtime[] {
    this.#assertValid();
    return this.#scheduler.stack;
  }

  async step(): Promise<StepResult> {
    this.#assertIdle();
    this.#scheduler.busy = true;
    try {
      await Promise.resolve();
      if (this.#finished()) return { state: this.#state, event: null };
      return await this.#advanceTop();
    } finally {
      this.#scheduler.busy = false;
    }
  }

  async run(): Promise<RunState> {
    this.#assertIdle();
    this.#scheduler.busy = true;
    try {
      // The target is this invocation, not necessarily the root of the scheduler.
      do {
        await Promise.resolve();
        if (this.#finished()) break;
        await this.#advanceTop();
      } while (!this.#finished());
      return this.#state;
    } finally {
      this.#scheduler.busy = false;
    }
  }

  setFields(values: RuntimeFields): RunState {
    this.#assertIdle();
    if (this.#finished()) {
      throw new RuntimeError("RUNTIME_FINISHED", "Reset the root before modifying a finished run.");
    }
    const entries = this.#prepareEntries(values, false);
    for (const [name, value] of entries) this.#state.fields[name] = value;
    return this.#state;
  }

  reset(inputs: RuntimeFields = {}): RunState {
    this.#assertIdle();
    if (!this.#root)
      throw new RuntimeError("ROOT_RESET_ONLY", "Only the root runtime may reset the run.");
    const fields = this.#initialFields(inputs);
    // Validate first; a rejected reset must not invalidate existing children.
    this.#scheduler.generation++;
    this.#generation = this.#scheduler.generation;
    this.#scheduler.stack.splice(0, this.#scheduler.stack.length, this);
    this.#stack = this.#initialStack();
    this.#pending = undefined;
    this.#state.invocationId = this.#nextId();
    this.#state.fields = fields;
    this.#status = "ready";
    this.#state.nextStepPath = this.#current()?.path ?? null;
    delete this.#state.error;
    delete this.#state.output;
    return this.#state;
  }

  #nextId(): string {
    return `${this.#scheduler.id}:${++this.#scheduler.sequence}`;
  }
  #finished(): boolean {
    return this.#status === "completed" || this.#status === "failed";
  }
  #assertValid(): void {
    if (this.#generation !== this.#scheduler.generation) {
      throw new RuntimeError("RUNTIME_INVALIDATED", "This invocation belongs to a previous run.");
    }
  }
  #assertIdle(): void {
    this.#assertValid();
    if (this.#scheduler.busy)
      throw new RuntimeError("RUNTIME_BUSY", "Runtime is already executing.");
  }

  #initialStack(): Frame[] {
    return [{ kind: "sequence", steps: this.#flow.steps, path: "steps", index: 0 }];
  }

  #initialFields(inputs: RuntimeFields): RuntimeFields {
    const fields: RuntimeFields = Object.fromEntries(
      Object.entries(this.#fields).map(([name, definition]) => [
        name,
        Object.hasOwn(definition, "initial") ? copyJson(definition.initial) : undefined,
      ]),
    );
    for (const [name, value] of this.#prepareEntries(inputs, true)) fields[name] = value;
    return fields;
  }

  #prepareEntries(values: RuntimeFields, inputsOnly: boolean): [string, unknown][] {
    if (!isRecord(values))
      throw new RuntimeError("INVALID_INPUT", "Expected a field-value object.");
    // Gather and validate all keys before committing; values keep their identity.
    return Object.entries(values).map(([name, value]) => {
      if (!Object.hasOwn(this.#fields, name)) {
        throw new RuntimeError("UNKNOWN_FIELD", `Unknown field: ${name}.`, undefined, name);
      }
      if (inputsOnly && !this.#fields[name]!.input) {
        throw new RuntimeError("INVALID_INPUT", `Field is not an input: ${name}.`, undefined, name);
      }
      return [name, value];
    });
  }

  #read(value: Operand): unknown {
    return resolveOperand(this.#state.fields, value);
  }

  #number(field: Operand): number {
    try {
      return toNumber(this.#read(field));
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw new RuntimeError(
          error.code,
          error.message,
          undefined,
          typeof field === "string" && field.startsWith("$") ? field : undefined,
        );
      }
      throw error;
    }
  }

  /** Pop exhausted lists, but leave loop checks as explicit user-visible steps. */
  #current(): { frame: Frame; step: Exclude<Step, { type: "group" }>; path: string } | null {
    while (this.#stack.length > 0) {
      const frame = this.#stack[this.#stack.length - 1]!;
      if (frame.kind === "loop") return { frame, step: frame.step, path: frame.path };
      const step = frame.steps[frame.index];
      if (step?.type === "group") {
        const path = `${frame.path}[${frame.index}].steps`;
        frame.index++;
        this.#stack.push({ kind: "sequence", steps: step.steps, path, index: 0 });
        continue;
      }
      if (step) return { frame, step, path: `${frame.path}[${frame.index}]` };
      this.#stack.pop();
    }
    return null;
  }

  async #advanceTop(): Promise<StepResult> {
    const active = this.#scheduler.stack.at(-1)!;
    const event = await active.#advance();
    if (active.#status === "completed") {
      const failure = this.#settleReturns();
      if (event && failure) event.error = failure;
    }
    if (event && active.#state.error) event.error = active.#state.error;
    return { state: active.#state, event };
  }

  async #advance(): Promise<StepEvent | null> {
    this.#status = "running";
    const current = this.#current();
    if (!current) {
      this.#complete();
      return null;
    }
    const { step, path, frame } = current;
    const event: StepEvent = {
      invocationId: this.invocationId,
      flowName: this.flowName,
      ...(this.source === undefined ? {} : { source: this.source }),
      path,
      type: step.type,
      ...(step.description === undefined ? {} : { description: step.description }),
    };
    try {
      if (step.type === "while") {
        let loop: LoopFrame;
        if (frame.kind === "sequence") {
          frame.index++;
          loop = { kind: "loop", step, path, iterations: 0 };
          this.#stack.push(loop);
        } else {
          loop = frame;
        }
        const condition = Boolean(this.#read(step.condition));
        event.condition = condition;
        event.branch = condition ? "body" : "exit";
        if (!condition) {
          this.#stack.pop();
        } else {
          if (loop.iterations >= this.#scheduler.maxIterations) {
            throw new RuntimeError(
              "LOOP_LIMIT",
              `Loop exceeded ${this.#scheduler.maxIterations} iterations.`,
              path,
              typeof step.condition === "string" ? step.condition : undefined,
            );
          }
          loop.iterations++;
          this.#stack.push({ kind: "sequence", steps: step.body, path: `${path}.body`, index: 0 });
        }
      } else if (frame.kind === "sequence") {
        if (step.type === "call") {
          if (this.#loaded.imports.has(step.target)) {
            this.#enterCall(step, path, frame, event);
            return event;
          }
          const handler = this.#scheduler.functions.get(step.target)!;
          const inputs = this.#callInputs(step);
          const result = await handler(inputs);
          this.#commitOutputs(step, result);
          frame.index++;
        } else if (step.type === "if") {
          const condition = Boolean(this.#read(step.condition));
          const branch = condition ? "then" : "else";
          event.condition = condition;
          event.branch = branch;
          frame.index++;
          this.#stack.push({
            kind: "sequence",
            steps: step[branch] ?? [],
            path: `${path}.${branch}`,
            index: 0,
          });
        } else if (step.type === "append") {
          appendReference(this.#state.fields, step.field, this.#read(step.value));
          frame.index++;
        } else {
          const [field, value] = this.#evaluate(step);
          writeReferences(this.#state.fields, [[field, value]]);
          frame.index++;
        }
      }
      const next = this.#current();
      this.#state.nextStepPath = next?.path ?? null;
      if (!next) this.#complete();
    } catch (error) {
      event.error = this.#fail(error, path);
    }
    return event;
  }

  #enterCall(step: CallStep, path: string, frame: SequenceFrame, event: StepEvent): void {
    if (this.#scheduler.stack.length >= this.#scheduler.maxCallDepth) {
      throw new RuntimeError(
        "CALL_DEPTH_LIMIT",
        `Call depth exceeded ${this.#scheduler.maxCallDepth}.`,
        path,
      );
    }
    const definition = this.#loaded.imports.get(step.target)!;
    const inputs = this.#callInputs(step);
    const child = new FlowRuntime(definition, inputs, this.#scheduler);
    this.#pending = { step, path, frame };
    this.#status = "waiting";
    this.#state.nextStepPath = path;
    this.#scheduler.stack.push(child);
    event.childInvocationId = child.invocationId;
    if (definition.definition.steps.length === 0) {
      child.#complete();
      this.#settleReturns();
    }
  }

  /** Return and output commit are structural actions, never extra executable steps. */
  #settleReturns(): RuntimeFailure | undefined {
    const stack = this.#scheduler.stack;
    while (stack.length > 1) {
      const child = stack.at(-1)!;
      if (child.#status !== "completed") break;
      const parent = stack[stack.length - 2]!;
      const pending = parent.#pending!;
      const output = child.#state.output!;
      try {
        parent.#commitOutputs(pending.step, output);
      } catch (error) {
        return parent.#fail(error, pending.path);
      }
      pending.frame.index++;
      parent.#pending = undefined;
      parent.#status = "running";
      stack.pop();
      const next = parent.#current();
      parent.#state.nextStepPath = next?.path ?? null;
      if (!next) parent.#complete();
    }
  }

  #fail(error: unknown, path: string): RuntimeFailure {
    this.#state.nextStepPath = path;
    let message = "Execution failed with an unprintable error value.";
    try {
      message = error instanceof Error ? error.message : String(error);
    } catch {
      /* Host code may throw any value. */
    }
    const failure: RuntimeFailure = {
      code: error instanceof RuntimeError ? error.code : "EXECUTION_ERROR",
      message,
      path,
      invocationId: this.invocationId,
      flowName: this.flowName,
      ...(this.source === undefined ? {} : { source: this.source }),
      callStack: this.#scheduler.stack.map((runtime) => ({
        invocationId: runtime.invocationId,
        flowName: runtime.flowName,
        ...(runtime.source === undefined ? {} : { source: runtime.source }),
        path: runtime.#state.nextStepPath ?? "steps",
      })),
    };
    if (error instanceof RuntimeError && error.field !== undefined) failure.field = error.field;
    // Keep the call stack intact for inspection, without committing pending outputs.
    for (const runtime of this.#scheduler.stack) {
      runtime.#status = "failed";
      runtime.#state.error = failure;
    }
    return failure;
  }

  #callInputs(step: CallStep): RuntimeFields {
    return Object.fromEntries(
      Object.entries(step.inputs ?? {}).map(([name, source]) => [name, this.#read(source)]),
    );
  }

  #commitOutputs(step: CallStep, result: unknown): void {
    const container: object | undefined = result == null ? undefined : (Object(result) as object);
    const entries: [string, unknown][] =
      step.output !== undefined
        ? [[step.output, result]]
        : Object.entries(step.outputs ?? {}).map(([name, destination]) => [
            destination,
            container !== undefined && Object.hasOwn(container, name)
              ? Reflect.get(container, name)
              : undefined,
          ]);
    // Resolve all properties before writes. Missing own properties overwrite with undefined.
    writeReferences(this.#state.fields, entries);
  }

  #evaluate(
    step: Exclude<Step, { type: "if" | "while" | "call" | "append" | "group" }>,
  ): [string, unknown] {
    switch (step.type) {
      case "set":
        return [step.field, this.#read(step.value)];
      case "template":
        return [step.output, renderTemplate(step.template, (reference) => this.#read(reference))];
      case "and":
        return [step.output, step.inputs.every((source) => Boolean(this.#read(source)))];
      case "or":
        return [step.output, step.inputs.some((source) => Boolean(this.#read(source)))];
      case "not":
        return [step.output, !this.#read(step.input)];
      case "equal":
        return [step.output, equalValues(this.#read(step.left), this.#read(step.right))];
      case "notEqual":
        return [step.output, !equalValues(this.#read(step.left), this.#read(step.right))];
      default: {
        const left = this.#number(step.left);
        const right = this.#number(step.right);
        let result: number | boolean;
        switch (step.type) {
          case "add":
            result = left + right;
            break;
          case "subtract":
            result = left - right;
            break;
          case "multiply":
            result = left * right;
            break;
          case "divide":
            if (right === 0) throw new RuntimeError("DIVISION_BY_ZERO", "Cannot divide by zero.");
            result = left / right;
            break;
          case "greaterThan":
            result = left > right;
            break;
          case "lessThan":
            result = left < right;
            break;
          case "greaterThanOrEqual":
            result = left >= right;
            break;
          case "lessThanOrEqual":
            result = left <= right;
            break;
        }
        if (typeof result === "number" && !Number.isFinite(result)) {
          throw new RuntimeError("INVALID_NUMBER", "Operation produced a non-finite number.");
        }
        return [step.output, result];
      }
    }
  }

  #complete(): void {
    this.#status = "completed";
    this.#state.nextStepPath = null;
    this.#state.output = Object.fromEntries(
      Object.entries(this.#fields)
        .filter(([, definition]) => definition.output)
        .map(([name]) => [name, this.#state.fields[name]!]),
    );
  }
}

export function createRuntime(
  flow: FlowDefinition | LoadedFlow,
  inputs: RuntimeFields = {},
  options: RuntimeOptions = {},
): Runtime {
  const data: unknown = options;
  if (
    !isRecord(data) ||
    Object.keys(data).some((key) => !["maxIterations", "maxCallDepth", "functions"].includes(key))
  ) {
    throw new RuntimeError(
      "INVALID_OPTIONS",
      "Supported options: maxIterations, maxCallDepth, functions.",
    );
  }
  for (const key of ["maxIterations", "maxCallDepth"]) {
    if (
      Object.hasOwn(data, key) &&
      (typeof data[key] !== "number" || !Number.isSafeInteger(data[key]) || data[key] <= 0)
    ) {
      throw new RuntimeError("INVALID_OPTIONS", `${key} must be a positive safe integer.`);
    }
  }
  const functions = new Map<string, RuntimeFunction>();
  if (Object.hasOwn(data, "functions")) {
    if (!isRecord(data.functions))
      throw new RuntimeError("INVALID_OPTIONS", "functions must be a function registry.");
    for (const [id, handler] of Object.entries(data.functions)) {
      if (typeof handler !== "function")
        throw new RuntimeError("INVALID_OPTIONS", `Expected a function for ${id}.`);
      functions.set(id, handler as RuntimeFunction);
    }
  }
  const rootFlow = prepareGraph(flow, functions);
  const scheduler: Scheduler = {
    id: ++nextSchedulerId,
    generation: 0,
    sequence: 0,
    busy: false,
    stack: [],
    functions,
    maxIterations: options.maxIterations ?? 1000,
    maxCallDepth: options.maxCallDepth ?? 32,
  };
  const root = new FlowRuntime(rootFlow, inputs, scheduler, true);
  scheduler.stack.push(root);
  return root;
}
