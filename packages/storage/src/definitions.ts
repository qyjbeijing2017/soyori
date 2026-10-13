import type { ToolDefinition } from "soyori-core";

const key = {
  name: "key",
  valueType: "string",
  required: true,
  initial: "$memoryKey",
  description: "存储键，可用 / 分组。",
};
export const STORAGE_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  "storage.read": {
    name: "storage.read",
    inputs: [key],
    outputs: [
      { name: "found", valueType: "boolean" },
      { name: "value", valueType: "JSON" },
    ],
  },
  "storage.write": {
    name: "storage.write",
    inputs: [key, { name: "value", valueType: "JSON", required: true, initial: "$memory" }],
    outputs: [{ name: "key", valueType: "string" }],
  },
  "storage.delete": {
    name: "storage.delete",
    inputs: [key],
    outputs: [{ name: "deleted", valueType: "boolean" }],
  },
  "storage.list": {
    name: "storage.list",
    inputs: [
      {
        name: "prefix",
        valueType: "string",
        defaultValue: "",
        placeholder: "空字符串（列出全部）",
      },
    ],
    outputs: [{ name: "keys", valueType: "string[]" }],
  },
};
