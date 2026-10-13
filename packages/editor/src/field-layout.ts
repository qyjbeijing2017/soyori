import { type FieldCollection, type FieldEntry, fieldEntries } from "soyori-core";

/** Move a declaration without changing its value or group metadata. */
export function moveFieldEntry(
  fields: FieldCollection,
  from: number[],
  parent: number[],
  index: number,
): FieldEntry[] {
  const tree = structuredClone(fieldEntries(fields));
  if (!from.length || (parent.length >= from.length && from.every((part, i) => parent[i] === part)))
    return tree;
  const list = (path: number[]) => {
    let items = tree;
    for (const part of path) {
      const group = items[part];
      if (group?.type !== "group") return undefined;
      items = group.fields;
    }
    return items;
  };
  const source = list(from.slice(0, -1));
  const destination = list(parent);
  const oldIndex = from.at(-1)!;
  if (!source?.[oldIndex] || !destination) return tree;
  const [entry] = source.splice(oldIndex, 1);
  const position = source === destination && oldIndex < index ? index - 1 : index;
  destination.splice(Math.max(0, Math.min(position, destination.length)), 0, entry);
  return tree;
}

export function changeFieldList(
  fields: FieldCollection,
  path: number[],
  change: (items: FieldEntry[]) => FieldEntry[],
): FieldEntry[] {
  const entries = fieldEntries(fields);
  if (!path.length) return change(entries);
  return entries.map((entry, index) =>
    index === path[0] && entry.type === "group"
      ? { ...entry, fields: changeFieldList(entry.fields, path.slice(1), change) }
      : entry,
  );
}
export function fieldLocation(
  fields: FieldCollection,
  name: string,
  path: number[] = [],
): { path: number[]; index: number } | undefined {
  for (const [index, entry] of fieldEntries(fields).entries()) {
    if (entry.type === "group") {
      const found = fieldLocation(entry.fields, name, [...path, index]);
      if (found) return found;
    } else if (entry.name === name) return { path, index };
  }
  return undefined;
}
export function putField(
  fields: FieldCollection,
  original: string | null,
  entry: FieldEntry,
  path: number[],
): FieldEntry[] {
  const location = original === null ? undefined : fieldLocation(fields, original);
  if (location && JSON.stringify(location.path) === JSON.stringify(path)) {
    return changeFieldList(fields, path, (items) =>
      items.map((item, index) => (index === location.index ? entry : item)),
    );
  }
  const removed = location
    ? changeFieldList(fields, location.path, (items) =>
        items.filter((_, index) => index !== location.index),
      )
    : fieldEntries(fields);
  // Removing a root field can shift a destination group's position.
  const adjusted = [...path];
  if (
    location &&
    location.path.length < path.length &&
    location.path.every((value, i) => path[i] === value) &&
    location.index < path[location.path.length]
  )
    adjusted[location.path.length]--;
  return changeFieldList(removed, adjusted, (items) => [...items, entry]);
}
export function fieldGroupOptions(
  fields: FieldCollection,
  path: number[] = [],
  parent = "",
): { value: string; label: string }[] {
  return fieldEntries(fields).flatMap((entry, index) => {
    if (entry.type !== "group") return [];
    const next = [...path, index];
    const label = parent ? `${parent} / ${entry.name}` : entry.name;
    return [
      { value: JSON.stringify(next), label },
      ...fieldGroupOptions(entry.fields, next, label),
    ];
  });
}
