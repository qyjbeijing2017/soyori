import { RuntimeError } from "./errors.js";
import type { FieldCollection, FieldDefinition, FieldEntry, FieldGroupDefinition } from "./flow.js";

/** Presentation entries; groups keep their mapping key separately from their label. */
export function fieldEntries(fields: FieldCollection): FieldEntry[] {
  return Array.isArray(fields)
    ? fields.map((entry) =>
        entry.type === "group" ? { ...entry, fields: fieldEntries(entry.fields) } : entry,
      )
    : Object.entries(fields).map(([name, definition]) =>
        definition.type === "group"
          ? {
              ...definition,
              key: name,
              name: definition.name ?? name,
              fields: fieldEntries(definition.fields),
            }
          : { ...definition, name },
      );
}

/** Serialize declarations as name-to-configuration mappings, including nested groups. */
export function keyedFields(fields: FieldCollection): Exclude<FieldCollection, FieldEntry[]> {
  const entries = fieldEntries(fields);
  const reserved = new Set(entries.filter((entry) => entry.type !== "group").map((e) => e.name));
  const used = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "group" || entry.key === undefined) continue;
    if (reserved.has(entry.key) || used.has(entry.key))
      throw new RuntimeError("INVALID_FLOW", `Duplicate field or group key: ${entry.key}.`);
    used.add(entry.key);
  }
  const result: [string, FieldDefinition | FieldGroupDefinition][] = [];
  for (const entry of entries) {
    if (entry.type === "group") {
      let key = entry.key ?? entry.name;
      if (entry.key === undefined) {
        let suffix = 2;
        while (reserved.has(key) || used.has(key)) key = `${entry.name}_${suffix++}`;
        used.add(key);
      }
      const { key: _key, fields: children, ...metadata } = entry;
      result.push([key, { ...metadata, fields: keyedFields(children) }]);
    } else {
      if (used.has(entry.name))
        throw new RuntimeError("INVALID_FLOW", `Duplicate field or group key: ${entry.name}.`);
      used.add(entry.name);
      const { name, ...definition } = entry;
      result.push([name, definition]);
    }
  }
  return Object.fromEntries(result);
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
  const remaining = new Map(Object.entries(definitions));
  const visit = (items: FieldEntry[]): FieldEntry[] =>
    items.flatMap<FieldEntry>((item) => {
      if (item.type === "group") return [{ ...item, fields: visit(item.fields) }];
      const definition = remaining.get(item.name);
      remaining.delete(item.name);
      return definition ? [{ ...definition, name: item.name }] : [];
    });
  const result = visit(fieldEntries(fields));
  const updated = [
    ...result,
    ...Array.from(remaining, ([name, definition]) => ({ ...definition, name })),
  ];
  return Array.isArray(fields) ? updated : keyedFields(updated);
}
