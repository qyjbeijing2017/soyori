import { fieldDefinitions, withFieldDefinitions } from "./fields.js";
import type { FlowDefinition } from "./flow.js";

export const REDACTED = "[sensitive]";

export function redactFailure<T extends { message: string }>(
  error: T,
  sensitive: readonly string[],
): T {
  return sensitive.length ? { ...error, message: "[sensitive error]" } : error;
}

/** A shallow display copy; never changes runtime values or follows derived data. */
export function redactFields(values: Readonly<Record<string, unknown>>, names: readonly string[]) {
  const sensitive = new Set(names);
  const result: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(values, name);
    if (!descriptor?.enumerable) continue;
    Object.defineProperty(result, name, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: sensitive.has(name)
        ? REDACTED
        : "value" in descriptor
          ? descriptor.value
          : "[accessor]",
    });
  }
  return result;
}

/** Export a flow without defaults explicitly marked sensitive, preserving all other data. */
export function withoutSensitiveInitials(flow: FlowDefinition): FlowDefinition {
  return {
    ...flow,
    fields: withFieldDefinitions(
      flow.fields,
      Object.fromEntries(
        Object.entries(fieldDefinitions(flow.fields)).map(([name, field]) => {
          if (!field.sensitive) return [name, field];
          const { initial: _initial, ...rest } = field;
          return [name, rest];
        }),
      ),
    ),
  };
}
