import { types } from "node:util";

/** Bounded diagnostic encoding: never call getters, toJSON or custom inspectors. */
export function summarize(value: unknown): unknown {
  const seen = new Set<object>();
  let budget = 200;
  const visit = (item: unknown, depth: number): unknown => {
    if (--budget < 0 || depth > 4) return { $type: "truncated" };
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string")
      return item.length > 256
        ? { $type: "string", preview: item.slice(0, 256), truncated: true }
        : item;
    if (typeof item === "number")
      return Number.isFinite(item) ? item : { $type: "number", value: String(item) };
    if (typeof item !== "object") return { $type: typeof item };
    if (types.isProxy(item)) return { $type: "proxy" };
    if (seen.has(item)) return { $type: "reference" };
    if (ArrayBuffer.isView(item) || types.isAnyArrayBuffer(item)) return { $type: "binary" };
    const prototype: unknown = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      return { $type: "object" };
    seen.add(item);
    const entries: [string, unknown][] = [];
    let count = 0;
    for (const key in item) {
      if (!Object.hasOwn(item, key)) continue;
      if (count++ >= 50 || budget <= 0) {
        entries.push(["$truncated", true]);
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      entries.push([
        key,
        descriptor && "value" in descriptor
          ? visit(descriptor.value, depth + 1)
          : { $type: "accessor" },
      ]);
    }
    return { $type: Array.isArray(item) ? "array" : "record", entries };
  };
  return visit(value, 0);
}
