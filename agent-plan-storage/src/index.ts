export interface Storage {
  read(key: string): Promise<{ found: boolean; value: unknown }>;
  write(key: string, value: unknown): Promise<{ key: string }>;
  delete(key: string): Promise<{ deleted: boolean }>;
  list(prefix?: string): Promise<{ keys: string[] }>;
}

export function validateKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.length > 240 || !key.length)
    throw new Error("STORAGE_KEY: Expected a key of 1–240 characters.");
  for (const part of key.split("/")) {
    if (
      !/^[a-z0-9_-][a-z0-9._-]*$/.test(part) ||
      part.endsWith(".") ||
      part.length > 80 ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(part)
    )
      throw new Error(
        "STORAGE_KEY: Use lowercase letters, digits, -, _ and . separated by /; reserved filenames are forbidden.",
      );
  }
}

export function validatePrefix(prefix: unknown): asserts prefix is string {
  if (prefix === "") return;
  validateKey(typeof prefix === "string" && prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
}

/** Reject values that JSON.stringify would silently lose or transform. */
export function encode(value: unknown): string {
  const parents = new Set<object>();
  function check(v: unknown): void {
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number" && Number.isFinite(v)) return;
    if (!v || typeof v !== "object" || parents.has(v))
      throw new Error("STORAGE_JSON: Expected acyclic JSON data.");
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw new Error("STORAGE_JSON: Expected plain JSON objects.");
    if (Object.getOwnPropertySymbols(v).length)
      throw new Error("STORAGE_JSON: Symbol keys are unsupported.");
    parents.add(v);
    if (
      Array.isArray(v) &&
      (Object.keys(v).length !== v.length || Object.keys(v).some((key, i) => key !== String(i)))
    )
      throw new Error("STORAGE_JSON: Sparse arrays or extra properties are unsupported.");
    for (const key of Object.getOwnPropertyNames(v)) {
      if (Array.isArray(v) && key === "length") continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d?.enumerable || !("value" in d))
        throw new Error("STORAGE_JSON: Accessors and hidden properties are unsupported.");
      check(d.value);
    }
    parents.delete(v);
  }
  check(value);
  return JSON.stringify(value);
}

export function createStorageTools(storage: Storage) {
  return {
    "storage.read": async ({ key }: Record<string, unknown>) => {
      validateKey(key);
      return storage.read(key);
    },
    "storage.write": async ({ key, value }: Record<string, unknown>) => {
      validateKey(key);
      return storage.write(key, value);
    },
    "storage.delete": async ({ key }: Record<string, unknown>) => {
      validateKey(key);
      return storage.delete(key);
    },
    "storage.list": async ({ prefix = "" }: Record<string, unknown>) => {
      validatePrefix(prefix);
      return storage.list(prefix);
    },
  };
}
