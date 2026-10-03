import { type JsonValue, toJsonValue } from "agent-plan-core";
import { parseDocument, stringify } from "yaml";

export function inferValue(source: string, allowUnset = false): JsonValue | undefined {
  if (!source.trim()) return allowUnset ? undefined : "";
  const document = parseDocument(source, { uniqueKeys: true, schema: "core" });
  if (document.errors.length || document.warnings.length)
    throw new Error(document.errors[0]?.message ?? document.warnings[0]?.message);
  const value = toJsonValue(document.toJS({ maxAliasCount: 20 }));
  // Plain text is not YAML prose: preserve whitespace and line breaks as typed.
  if (typeof value === "string" && !/^["'|>]/.test(source.trimStart())) return source;
  return value;
}

export function formatValue(value: unknown): string {
  if (value === undefined) return "";
  const json = toJsonValue(value);
  if (typeof json === "string") {
    try {
      if (inferValue(json) === json && json.trim()) return json;
    } catch {
      /* Quote strings that otherwise look like invalid structured data. */
    }
    return JSON.stringify(json);
  }
  return stringify(json, { lineWidth: 0 }).trimEnd();
}

export function valueKind(value: unknown, literal: boolean): string {
  if (value === undefined) return "未设置";
  if (value === null) return "空值";
  if (Array.isArray(value)) return "列表";
  if (typeof value === "object") return "对象";
  if (typeof value === "number") return "数字";
  if (typeof value === "boolean") return "布尔值";
  if (!literal && typeof value === "string" && value.startsWith("$") && !value.startsWith("$$"))
    return "变量引用";
  return "文本";
}
