export type RuntimeErrorCode =
  | "INVALID_FLOW"
  | "INVALID_PATH"
  | "ARRAY_LIMIT"
  | "INVALID_VALUE"
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_OPTIONS"
  | "RUNTIME_BUSY"
  | "RUNTIME_FINISHED"
  | "RUNTIME_INVALIDATED"
  | "ROOT_RESET_ONLY"
  | "CALL_DEPTH_LIMIT"
  | "INVALID_NUMBER"
  | "INVALID_TEXT"
  | "DIVISION_BY_ZERO"
  | "LOOP_LIMIT"
  | "EXECUTION_ERROR";

/** Invalid API calls throw this error; execution failures are stored in state. */
export class RuntimeError extends Error {
  flowName?: string;
  source?: string;
  override readonly name = "RuntimeError";

  constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    public readonly path?: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}

export interface RuntimeFailure {
  code: RuntimeErrorCode;
  message: string;
  path: string;
  field?: string;
  /** Origin of the failure, followed by the active root-to-origin call chain. */
  invocationId?: string;
  flowName?: string;
  source?: string;
  callStack?: readonly RuntimeErrorFrame[];
}

export interface RuntimeErrorFrame {
  readonly invocationId: string;
  readonly flowName: string;
  readonly source?: string;
  readonly path: string;
}
