import { parseFlow } from "agent-plan-core";

// Use Core's public validator for path semantics, including reserved properties.
export function normalizeReference(source: string): string | null {
  const text = source.trim();
  if (!text) return "";
  const reference = text.startsWith("$") ? text : `$${text}`;
  try {
    parseFlow({
      schemaVersion: 1,
      name: "reference",
      fields: {},
      steps: [{ type: "set", field: reference, value: null }],
    });
    return reference;
  } catch {
    return null;
  }
}

export function fieldReference(name: string): string {
  const simple = `$${name}`;
  return normalizeReference(simple) === simple && !/[.[]/.test(name)
    ? simple
    : `$[${JSON.stringify(name)}]`;
}

export function variableQuery(text: string): string | null {
  if (text.length > 48 || /[\r\n]/.test(text) || text.startsWith("$$")) return null;
  const query = text.startsWith("$") ? text.slice(1) : text;
  // Suggestions are for short names/paths, never prose or structured values.
  if (query && !/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(query)) return null;
  if (["true", "false", "null"].includes(query)) return null;
  return query;
}
