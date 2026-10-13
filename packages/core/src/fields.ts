import type { FieldCollection, FieldDefinition, FieldEntry } from "./flow.js";

/** Ordered declarations; the object shorthand remains accepted for ungrouped fields. */
export function fieldEntries(fields: FieldCollection): FieldEntry[] {
  return Array.isArray(fields)
    ? fields
    : Object.entries(fields).map(([name, definition]) => ({ ...definition, name }));
}

/** Flat execution/interface view, independent of presentation groups. */
export function fieldDefinitions(fields: FieldCollection): Record<string, FieldDefinition> {
  const entries: [string, FieldDefinition][] = [];
  const visit = (items: FieldEntry[]) => {
    for (const item of items) {
      if (item.type === "group") visit(item.fields);
      else {
        const { name, ...definition } = item;
        entries.push([name, definition]);
      }
    }
  };
  visit(fieldEntries(fields));
  return Object.fromEntries(entries);
}

/** Replace flat definitions while retaining group metadata and declaration order. */
export function withFieldDefinitions(
  fields: FieldCollection,
  definitions: Record<string, FieldDefinition>,
): FieldCollection {
  if (!Array.isArray(fields)) return definitions;
  const remaining = new Map(Object.entries(definitions));
  const visit = (items: FieldEntry[]): FieldEntry[] =>
    items.flatMap<FieldEntry>((item) => {
      if (item.type === "group") return [{ ...item, fields: visit(item.fields) }];
      const definition = remaining.get(item.name);
      remaining.delete(item.name);
      return definition ? [{ ...definition, name: item.name }] : [];
    });
  const result = visit(fields);
  return [...result, ...Array.from(remaining, ([name, definition]) => ({ ...definition, name }))];
}
