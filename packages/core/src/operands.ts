import { RuntimeError } from "./errors.js";
import type { JsonValue } from "./flow.js";
import type { RuntimeFields } from "./runtime-types.js";
import { isRecord } from "./values.js";

type Segment = string | number;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export const MAX_ARRAY_LENGTH = 10_000;

/** A reference is a root name followed by property names or nonnegative indices. */
export function parseReference(reference: string): Segment[] {
  const fail = (): never => {
    throw new RuntimeError(
      "INVALID_PATH",
      `Invalid or unsafe reference: ${reference}.`,
      undefined,
      reference,
    );
  };
  if (!reference.startsWith("$") || reference.startsWith("$$")) fail();
  const parts: Segment[] = [];
  let position = 1;
  const name = (): void => {
    const match = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(reference.slice(position));
    if (!match) fail();
    parts.push(match![0]);
    position += match![0].length;
  };
  const bracket = (): void => {
    const match = /^\[("(?:[^"\\\r\n]|\\.)*"|0|[1-9]\d*)\]/.exec(reference.slice(position));
    if (!match) fail();
    try {
      const part = JSON.parse(match![1]!) as Segment;
      if (typeof part === "number" && (!Number.isSafeInteger(part) || part >= MAX_ARRAY_LENGTH))
        fail();
      parts.push(part);
    } catch {
      fail();
    }
    position += match![0].length;
  };
  if (reference[position] === "[") bracket();
  else name();
  if (typeof parts[0] !== "string") fail();
  while (position < reference.length) {
    if (reference[position] === ".") {
      position++;
      name();
    } else if (reference[position] === "[") bracket();
    else fail();
  }
  if (parts.some((part) => typeof part === "string" && forbidden.has(part))) fail();
  return parts;
}

/** Never invoke property getters or follow inherited properties. */
function own(value: unknown, key: Segment): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function"))
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !("value" in descriptor))
    throw new RuntimeError("INVALID_VALUE", "Accessor properties cannot be used in paths.");
  return descriptor?.value;
}

export function readReference(fields: RuntimeFields, reference: string): unknown {
  let value: unknown = fields;
  for (const part of parseReference(reference)) value = own(value, part);
  return value;
}

/** Literal containers are fresh per evaluation; referenced values retain identity. */
export function resolveOperand(fields: RuntimeFields, value: JsonValue): unknown {
  if (typeof value === "string") {
    if (value.startsWith("$$")) return value.slice(1);
    return value.startsWith("$") ? readReference(fields, value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveOperand(fields, item));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveOperand(fields, item)]),
    );
  return value;
}

export function collectReferences(value: JsonValue, visit: (reference: string) => void): void {
  if (typeof value === "string") {
    if (value.startsWith("$") && !value.startsWith("$$")) visit(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, visit);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectReferences(item, visit);
  }
}

/** Stage ordinary data writes so invalid destinations do not partially commit a step. */
export function writeReferences(fields: RuntimeFields, entries: [string, unknown][]): void {
  const pending = new Map<object, Map<string, unknown>>();
  const get = (object: object, key: Segment): unknown => {
    const writes = pending.get(object);
    return writes?.has(String(key)) ? writes.get(String(key)) : own(object, key);
  };
  let growth = 0;
  const put = (object: object, key: Segment, value: unknown): void => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (
      descriptor ? !("value" in descriptor) || !descriptor.writable : !Object.isExtensible(object)
    )
      throw new RuntimeError(
        "INVALID_VALUE",
        "Cannot write a read-only property or non-extensible object.",
      );
    let writes = pending.get(object);
    if (!writes) {
      writes = new Map();
      pending.set(object, writes);
    }
    writes.set(String(key), value);
  };
  const assign = (object: object, key: Segment, value: unknown): void => {
    if (Array.isArray(object) && typeof key === "number") {
      const length = get(object, "length") as number;
      if (key >= length) {
        growth += key + 1 - length;
        if (key >= MAX_ARRAY_LENGTH || growth > MAX_ARRAY_LENGTH)
          throw new RuntimeError(
            "ARRAY_LIMIT",
            `Array writes are limited to ${MAX_ARRAY_LENGTH} elements.`,
          );
        put(object, "length", key + 1);
        for (let index = length; index < key; index++) put(object, index, null);
      }
    }
    put(object, key, value);
  };
  for (const [reference, value] of entries) {
    const parts = parseReference(reference);
    let container: object = fields;
    for (let index = 0; index < parts.length - 1; index++) {
      const key = parts[index]!;
      const next = parts[index + 1]!;
      let child = get(container, key);
      const compatible =
        typeof next === "number"
          ? Array.isArray(child)
          : isRecord(child) || (Array.isArray(child) && next === "length");
      if (!compatible) {
        child = typeof next === "number" ? [] : {};
        assign(container, key, child);
      }
      container = child as object;
    }
    const last = parts.at(-1)!;
    if (Array.isArray(container) && typeof last !== "number")
      throw new RuntimeError(
        "INVALID_PATH",
        "Write array elements using numeric indices, not named properties.",
        undefined,
        reference,
      );
    assign(container, last, value);
  }
  for (const [object, writes] of pending) {
    for (const [key, value] of writes) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      Object.defineProperty(
        object,
        key,
        descriptor ? { value } : { value, enumerable: true, writable: true, configurable: true },
      );
    }
  }
}

export function appendReference(fields: RuntimeFields, reference: string, value: unknown): void {
  const current = readReference(fields, reference);
  if (Array.isArray(current)) {
    if (current.length >= MAX_ARRAY_LENGTH)
      throw new RuntimeError(
        "ARRAY_LIMIT",
        `Array writes are limited to ${MAX_ARRAY_LENGTH} elements.`,
      );
    writeReferences(fields, [[`${reference}[${current.length}]`, value]]);
  } else writeReferences(fields, [[reference, [value]]]);
}
