import type { JsonValue } from "./flow.js";
import type { RuntimeFunction } from "./runtime-types.js";

/** Documentation, not a second validator. Each handler owns its input contract. */
export interface ToolParameter {
  name: string;
  type?: never;
  description?: string;
  valueType?: string;
  required?: boolean;
  /** Runtime fallback, displayed without writing a call input. */
  defaultValue?: JsonValue;
  /** Raw call operand inserted when selecting this tool. */
  initial?: JsonValue;
  placeholder?: string;
}
export interface ParameterGroup {
  type: "group";
  name: string;
  description?: string;
  collapsed?: boolean;
  fields: ParameterEntry[];
}
export type ParameterEntry = ToolParameter | ParameterGroup;
export interface ToolDefinition {
  name: string;
  description?: string;
  inputs: ParameterEntry[];
  outputs: ParameterEntry[];
  /** Whole-return description for dynamic results without fixed property names. */
  returns?: { valueType: string; description?: string };
}
export type DescribedFunction = RuntimeFunction & { definition: ToolDefinition };

export function describeTools<T extends Record<string, RuntimeFunction>>(
  functions: T,
  definitions: Record<keyof T, ToolDefinition>,
): T & Record<keyof T, DescribedFunction> {
  for (const name of Object.keys(functions)) {
    if (!definitions[name] || definitions[name].name !== name)
      throw new Error(`Missing tool definition: ${name}`);
    Object.assign(functions[name]!, { definition: definitions[name] });
  }
  return functions as T & Record<keyof T, DescribedFunction>;
}

export function toolParameters(entries: ParameterEntry[]): ToolParameter[] {
  return entries.flatMap((entry) =>
    entry.type === "group" ? toolParameters(entry.fields) : [entry],
  );
}
