import { RuntimeError } from "./errors.js";
import type { JsonValue } from "./flow.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Return a detached JSON data tree, rejecting values that serialization would lose or execute. */
export function toJsonValue(value: unknown): JsonValue {
  return copyJson(value);
}

/** Shared implementation for definitions, output encoding, equality and text conversion. */
export function copyJson(value: unknown, path = "value", ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || (!Array.isArray(value) && !isRecord(value))) {
    throw new RuntimeError("INVALID_VALUE", `Expected JSON data at ${path}.`, path);
  }
  if (ancestors.has(value)) {
    throw new RuntimeError("INVALID_VALUE", `Circular value at ${path}.`, path);
  }
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const array = Array.isArray(value);
    const entries: [string, JsonValue][] = [];
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === "length") continue;
      const descriptor = typeof key === "string" ? descriptors[key] : undefined;
      if (
        typeof key !== "string" ||
        !descriptor?.enumerable ||
        !("value" in descriptor) ||
        (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
      ) {
        throw new RuntimeError(
          "INVALID_VALUE",
          `Expected enumerable JSON data properties at ${path}.`,
          path,
        );
      }
      entries.push([key, copyJson(descriptor.value, `${path}.${key}`, ancestors)]);
    }
    if (array) {
      if (entries.length !== value.length)
        throw new RuntimeError("INVALID_VALUE", `Sparse array at ${path}.`, path);
      return entries.map(([, item]) => item);
    }
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

export function toNumber(value: unknown): number {
  if (value === undefined) return 0;
  if (value !== null && !["number", "string", "boolean"].includes(typeof value)) {
    throw new RuntimeError("INVALID_NUMBER", "Value cannot be used as a number.");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RuntimeError("INVALID_NUMBER", "Value cannot be converted to a finite number.");
  }
  return number;
}

/** Non-JSON objects use identity semantics; do not traverse cycles indefinitely. */
function structurallyEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]!))
    );
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && structurallyEqual(left[key]!, right[key]!))
  );
}

export function equalValues(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left === "object" || typeof right === "object") {
    try {
      return structurallyEqual(copyJson(left), copyJson(right));
    } catch {
      return false;
    }
  }
  if (typeof left === typeof right) return false;
  try {
    return toNumber(left) === toNumber(right);
  } catch {
    return false;
  }
}
