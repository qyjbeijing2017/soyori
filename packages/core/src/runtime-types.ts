import type { RuntimeFailure } from "./errors.js";
import type { Step } from "./flow.js";
import type { ToolDefinition } from "./tools.js";

/** Containers are independent; their values are passed by reference. */
export type RuntimeFields = Record<string, unknown>;

/** Sync or async host capability. No runtime access is passed implicitly. */
export type RuntimeFunction = ((inputs: RuntimeFields) => unknown | Promise<unknown>) & {
  readonly definition?: ToolDefinition;
};

export type RunStatus = "ready" | "running" | "waiting" | "completed" | "failed" | "invalidated";

export interface RunState {
  readonly invocationId: string;
  readonly flowName: string;
  readonly source?: string;
  /** Root depth is 1. */
  readonly depth: number;
  readonly status: RunStatus;
  readonly busy: boolean;
  readonly fields: Readonly<RuntimeFields>;
  /** Waiting parents point to the call step until its outputs are committed. */
  readonly nextStepPath: string | null;
  readonly output?: Readonly<RuntimeFields>;
  readonly error?: Readonly<RuntimeFailure>;
}

export interface StepEvent {
  description?: string;
  invocationId: string;
  flowName: string;
  readonly source?: string;
  path: string;
  type: Step["type"];
  condition?: boolean;
  branch?: "then" | "else" | "body" | "exit";
  childInvocationId?: string;
  error?: Readonly<RuntimeFailure>;
}

export interface StepResult {
  /** Live state of the invocation that actually executed, even if it just returned. */
  state: RunState;
  event: Readonly<StepEvent> | null;
}

export interface RuntimeOptions {
  maxIterations?: number;
  /** Includes the root; defaults to 32. */
  maxCallDepth?: number;
  /** Host functions shared by every invocation in this scheduler. */
  functions?: Readonly<Record<string, RuntimeFunction>>;
}

export interface Runtime {
  readonly invocationId: string;
  readonly flowName: string;
  readonly source: string | undefined;
  /** Advance one step at the top of the shared call stack. */
  step(): Promise<StepResult>;
  /** Run until this invocation finishes, including its descendants. */
  run(): Promise<RunState>;
  getState(): RunState;
  /** Names explicitly marked sensitive in this invocation's flow. */
  getSensitiveFields(): string[];
  /** Live readonly root-to-active stack. Completed children are removed. */
  getStack(): readonly Runtime[];
  setFields(values: RuntimeFields): RunState;
  /** Only the root may reset. Invalidates all previous child instances. */
  reset(inputs?: RuntimeFields): RunState;
}
