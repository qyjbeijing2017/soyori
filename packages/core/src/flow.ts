/** JSON-compatible data. Finite numbers and acyclic values require runtime validation. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface DescriptionMetadata {
  /** Optional human-readable documentation. Does not affect execution. */
  description?: string;
}

export interface FieldDefinition extends DescriptionMetadata {
  /** JSON-only initial data. Defaults to undefined when omitted. */
  initial?: JsonValue;
  /** Accept a same-named input parameter. Defaults to false. */
  input?: boolean;
  /** Return the final value under the field name. Defaults to false. */
  output?: boolean;
  /** Host presentation/export hint only. No automatic propagation or access control. */
  sensitive?: boolean;
}

/** Inline presentation groups never introduce a variable scope. */
export interface FieldGroup extends DescriptionMetadata {
  type: "group";
  name: string;
  collapsed?: boolean;
  fields: FieldEntry[];
}
export type FieldEntry = (FieldDefinition & { name: string; type?: never }) | FieldGroup;
export type FieldCollection = Record<string, FieldDefinition> | FieldEntry[];

export interface GroupStep extends DescriptionMetadata {
  type: "group";
  name: string;
  collapsed?: boolean;
  steps: Step[];
}

/** Raw field name used in field declarations and host APIs. */
export type FieldName = string;
/** A $-prefixed destination, validated as a property/index path at runtime. */
export type FieldReference = `$${string}`;
/** JSON literals with recursively resolved $ references and $$ string escapes. */
export type Operand = JsonValue;

export interface SetStep extends DescriptionMetadata {
  type: "set";
  field: FieldReference;
  value: Operand;
}

export interface AppendStep extends DescriptionMetadata {
  type: "append";
  field: FieldReference;
  value: Operand;
}

interface BinaryStep<T extends string> extends DescriptionMetadata {
  type: T;
  left: Operand;
  right: Operand;
  output: FieldReference;
}

export type AddStep = BinaryStep<"add">;
export type SubtractStep = BinaryStep<"subtract">;
export type MultiplyStep = BinaryStep<"multiply">;
export type DivideStep = BinaryStep<"divide">;

export type MathStep = AddStep | SubtractStep | MultiplyStep | DivideStep;

export type EqualStep = BinaryStep<"equal">;
export type NotEqualStep = BinaryStep<"notEqual">;
export type GreaterThanStep = BinaryStep<"greaterThan">;
export type LessThanStep = BinaryStep<"lessThan">;
export type GreaterThanOrEqualStep = BinaryStep<"greaterThanOrEqual">;
export type LessThanOrEqualStep = BinaryStep<"lessThanOrEqual">;

export type ComparisonStep =
  | EqualStep
  | NotEqualStep
  | GreaterThanStep
  | LessThanStep
  | GreaterThanOrEqualStep
  | LessThanOrEqualStep;

interface MultiInputStep<T extends string> extends DescriptionMetadata {
  type: T;
  inputs: Operand[];
  output: FieldReference;
}

export type AndStep = MultiInputStep<"and">;
export type OrStep = MultiInputStep<"or">;

/** Render literal template text with $path$ references and $$ escapes. */
export interface TemplateStep extends DescriptionMetadata {
  type: "template";
  template: string;
  output: FieldReference;
}

export interface NotStep extends DescriptionMetadata {
  type: "not";
  input: Operand;
  output: FieldReference;
}

export type LogicStep = AndStep | OrStep | NotStep;

export interface IfStep extends DescriptionMetadata {
  type: "if";
  /** Resolved operand is evaluated using JavaScript truthiness. */
  condition: Operand;
  then: Step[];
  else?: Step[];
}

export interface WhileStep extends DescriptionMetadata {
  type: "while";
  /** Read before each iteration; the body must update it when needed. */
  condition: Operand;
  body: Step[];
}

interface CallStepBase extends DescriptionMetadata {
  type: "call";
  /** Import alias or registered host function name; collisions are invalid. */
  target: string;
  /** Callee parameter name -> operand. Missing child inputs keep defaults. */
  inputs?: Record<string, Operand>;
}

/** Capture the whole result or selected own properties, never both. */
export type CallStep = CallStepBase &
  (
    | { output: FieldReference; outputs?: never }
    | { output?: never; outputs?: Record<string, FieldReference> }
  );

/** Steps have no identifiers; array positions determine execution order. */
export type Step =
  | GroupStep
  | SetStep
  | AppendStep
  | MathStep
  | ComparisonStep
  | LogicStep
  | TemplateStep
  | IfStep
  | WhileStep
  | CallStep;

export interface FlowDefinition extends DescriptionMetadata {
  schemaVersion: 1;
  /** User-facing name, not an identity or lookup key. */
  name: string;
  /** Local aliases to opaque source locations. Resolved by the host, never by core. */
  imports?: Record<string, string>;
  /** Only fields needing defaults, documentation or input/output flags must be configured. */
  fields: FieldCollection;
  steps: Step[];
}

/** An in-memory dependency graph. Identity is object identity; cycles are allowed. */
export interface LoadedFlow {
  readonly definition: FlowDefinition;
  readonly imports: ReadonlyMap<string, LoadedFlow>;
  /** Optional host-provided location used only for diagnostics. */
  readonly source?: string;
}
