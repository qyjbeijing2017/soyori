/** Parse LFM's Python-style call notation as data. Never evaluate model output. */
export function parseNativeCalls(source: string) {
  let offset = 0;
  let values = 0;
  const fail = (): never => {
    throw Error("AI_TOOL_CALLS: Invalid native tool call syntax.");
  };
  if (source.length > 65536) fail();
  const space = () => {
    while (/\s/.test(source[offset] ?? "") && offset < source.length) offset++;
  };
  const take = (token: string) => {
    space();
    if (!source.startsWith(token, offset)) return false;
    offset += token.length;
    return true;
  };
  const expect = (token: string) => {
    if (!take(token)) fail();
  };
  const identifier = () => {
    space();
    const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(offset));
    if (!match) return fail();
    offset += match[0].length;
    return match[0];
  };
  const string = () => {
    space();
    const quote = source[offset++];
    if (quote !== '"' && quote !== "'") return fail();
    let result = "";
    while (offset < source.length) {
      const char = source[offset++];
      if (char === quote) return result;
      if (char.charCodeAt(0) < 32) fail();
      if (char !== "\\") {
        result += char;
        continue;
      }
      const escapeCode = source[offset++];
      if (escapeCode === "'" || escapeCode === '"' || escapeCode === "\\") result += escapeCode;
      else if (escapeCode === "u") {
        const digits = source.slice(offset, offset + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail();
        result += String.fromCharCode(Number.parseInt(digits, 16));
        offset += 4;
      } else {
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
        if (!Object.hasOwn(escapes, escapeCode)) fail();
        result += escapes[escapeCode];
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 32 || ++values > 4096) return fail();
    space();
    if (source[offset] === '"' || source[offset] === "'") return string();
    if (take("[")) {
      const list: unknown[] = [];
      if (take("]")) return list;
      do {
        list.push(value(depth + 1));
        if (take("]")) return list;
        expect(",");
      } while (!take("]"));
      return list;
    }
    if (take("{")) {
      const object: Record<string, unknown> = {};
      if (take("}")) return object;
      do {
        const key = string();
        if (["__proto__", "prototype", "constructor"].includes(key) || Object.hasOwn(object, key))
          fail();
        expect(":");
        object[key] = value(depth + 1);
        if (take("}")) return object;
        expect(",");
      } while (!take("}"));
      return object;
    }
    for (const [token, literal] of [
      ["True", true],
      ["False", false],
      ["None", null],
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const)
      if (take(token)) return literal;
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(offset));
    if (!number || !Number.isFinite(Number(number[0]))) return fail();
    offset += number[0].length;
    return Number(number[0]);
  };
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  expect("[");
  if (take("]")) return fail();
  do {
    if (calls.length >= 32) fail();
    const name = identifier();
    expect("(");
    const args: Record<string, unknown> = {};
    if (!take(")")) {
      do {
        const key = identifier();
        if (["__proto__", "prototype", "constructor"].includes(key) || Object.hasOwn(args, key))
          fail();
        expect("=");
        args[key] = value(0);
        if (take(")")) break;
        expect(",");
      } while (!take(")"));
    }
    calls.push({ name, arguments: args });
    if (take("]")) break;
    expect(",");
  } while (!take("]"));
  space();
  if (offset !== source.length) fail();
  return calls;
}

export function nativeValue(value: unknown): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) return `[${value.map(nativeValue).join(", ")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${nativeValue(item)}`)
      .join(", ")}}`;
  return JSON.stringify(value);
}
