// Display only: markers are not a restorable serialization format.
// This starter registers no host functions; fields originate in JSON definitions.
export function formatState(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, item) => {
      if (item === undefined) return "[undefined]";
      if (item !== null && typeof item === "object") {
        if (seen.has(item)) return "[shared or circular reference]";
        seen.add(item);
      }
      return item;
    },
    2,
  );
}
