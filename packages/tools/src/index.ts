import { describeTools, type RuntimeFunction, type ToolDefinition } from "soyori-core";
import { createSearchTool, SEARCH_TOOL_DEFINITION, type SearchOptions } from "./search.js";
import { createWebTool, WEB_TOOL_DEFINITION } from "./web.js";

export { SEARCH_TOOL_DEFINITION, type SearchOptions } from "./search.js";
export { WEB_TOOL_DEFINITION } from "./web.js";

const MAX_ITEMS = 100000;
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error("BASIC_INPUT: Expected a finite number.");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_ITEMS)
    throw Error("BASIC_INPUT: Expected text up to 100000 UTF-16 units.");
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS)
    throw Error("BASIC_INPUT: Expected an array up to 100000 items.");
  return value;
}
function integer(value: unknown): number {
  const n = number(value);
  if (!Number.isSafeInteger(n)) throw Error("BASIC_INPUT: Expected a safe integer.");
  return n;
}
function output(value: unknown) {
  return { result: value };
}
const definitions: Record<string, ToolDefinition> = {};
const handlers: Record<string, RuntimeFunction> = {};
function add(
  name: string,
  description: string,
  inputs: ToolDefinition["inputs"],
  run: RuntimeFunction,
) {
  definitions[name] = {
    name,
    description,
    inputs,
    outputs: [{ name: "result", valueType: "JSON" }],
  };
  handlers[name] = run;
}
const numeric = (name: string) => ({ name, valueType: "number", required: true });
const textual = (name: string) => ({ name, valueType: "string", required: true });
const list = (name: string) => ({ name, valueType: "JSON", required: true });
for (const [name, description, operation] of [
  ["abs", "绝对值。", Math.abs],
  ["floor", "向下取整。", Math.floor],
  ["ceil", "向上取整。", Math.ceil],
  ["round", "四舍五入；中点向正无穷取整，遵循 JavaScript Math.round。", Math.round],
] as const)
  add(`math.${name}`, description, [numeric("value")], ({ value }) =>
    output(operation(number(value))),
  );
for (const [name, description, operation] of [
  ["min", "最小值。", Math.min],
  ["max", "最大值。", Math.max],
] as const)
  add(
    `math.${name}`,
    description,
    [{ name: "values", valueType: "number[]", required: true }],
    ({ values }) => {
      const valuesArray = array(values);
      if (!valuesArray.length) throw Error("BASIC_INPUT: values must not be empty.");
      return output(valuesArray.map(number).reduce((a, b) => operation(a, b)));
    },
  );
add(
  "math.clamp",
  "将数值限制在 min 到 max 之间。",
  [numeric("value"), numeric("min"), numeric("max")],
  ({ value, min, max }) => {
    const low = number(min),
      high = number(max);
    if (low > high) throw Error("BASIC_INPUT: min must not exceed max.");
    return output(Math.min(high, Math.max(low, number(value))));
  },
);
add(
  "math.random",
  "随机小数，范围 [min,max)；不是密码学随机数。",
  [
    { name: "min", valueType: "number", defaultValue: 0 },
    { name: "max", valueType: "number", defaultValue: 1 },
  ],
  ({ min = 0, max = 1 }) => {
    const low = number(min),
      high = number(max);
    if (low >= high || !Number.isFinite(high - low))
      throw Error("BASIC_INPUT: Expected a finite positive range.");
    const result = low + Math.random() * (high - low);
    return output(result < high ? result : low);
  },
);
add("text.trim", "移除文本两端空白。", [textual("text")], (input) =>
  output(text(input.text).trim()),
);
add(
  "text.split",
  "按字面分隔符分割文本；空分隔符按 UTF-16 单元分割。",
  [textual("text"), textual("separator")],
  (input) => {
    const result = text(input.text).split(text(input.separator));
    if (result.length > MAX_ITEMS) throw Error("BASIC_LIMIT: Too many split items.");
    return output(result);
  },
);
add(
  "text.replace",
  "替换所有字面匹配，不使用正则表达式。",
  [textual("text"), textual("search"), textual("replacement")],
  (input) => {
    const source = text(input.text),
      search = text(input.search),
      replacement = text(input.replacement);
    if (!search) throw Error("BASIC_INPUT: search must not be empty.");
    const parts = source.split(search);
    if (source.length + (parts.length - 1) * (replacement.length - search.length) > MAX_ITEMS)
      throw Error("BASIC_LIMIT: Replacement text exceeds limit.");
    return output(parts.join(replacement));
  },
);
add("array.concat", "按顺序合并多个数组，只合并一层。", [list("arrays")], ({ arrays }) => {
  const lists = array(arrays).map(array);
  if (lists.reduce((total, items) => total + items.length, 0) > MAX_ITEMS)
    throw Error("BASIC_LIMIT: Concatenated array exceeds limit.");
  return output(lists.flat(1));
});
add(
  "array.slice",
  "截取数组，end 不包含在内，负索引从末尾计算。",
  [
    list("array"),
    { name: "start", valueType: "integer", defaultValue: 0 },
    { name: "end", valueType: "integer" },
  ],
  (input) =>
    output(
      array(input.array).slice(
        integer(input.start ?? 0),
        input.end === undefined ? undefined : integer(input.end),
      ),
    ),
);
add("array.length", "数组元素数量。", [list("array")], (input) =>
  output(array(input.array).length),
);
export const BASIC_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  ...definitions,
  "time.now": {
    name: "time.now",
    description:
      "获取当前日期和时间。用户未指定时区时，省略 timeZone，使用设备本地时区，不要自行选择 UTC。date 和 time 对应返回的 timeZone；time 使用 24 小时制，08:56 是上午，20:56 才是晚上。iso 始终为 UTC，不要与本地时间混用。",
    inputs: [
      {
        name: "timeZone",
        valueType: "string",
        description: "仅在用户明确指定时区时填写 IANA 时区，例如 Asia/Shanghai 或 UTC；否则省略。",
      },
    ],
    outputs: [
      { name: "timestamp", valueType: "number" },
      { name: "iso", valueType: "string", description: "UTC ISO 时间，末尾 Z 表示 UTC。" },
      { name: "timeZone", valueType: "string" },
      { name: "date", valueType: "string" },
      {
        name: "time",
        valueType: "string",
        description: "timeZone 对应的 24 小时制时间 HH:mm:ss。",
      },
      { name: "weekday", valueType: "integer", description: "周一为 1，周日为 7。" },
    ],
  },
  "web.fetch": WEB_TOOL_DEFINITION,
  "web.search": SEARCH_TOOL_DEFINITION,
};
export function createBasicTools(options: SearchOptions = {}) {
  return describeTools(
    {
      ...handlers,
      "time.now": ({ timeZone }: Record<string, unknown>) => {
        if (timeZone !== undefined && (typeof timeZone !== "string" || !timeZone.trim()))
          throw Error("TIME_INPUT: Expected an IANA time zone.");
        let formatter: Intl.DateTimeFormat;
        try {
          formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timeZone as string | undefined,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            weekday: "short",
            hourCycle: "h23",
          });
        } catch {
          throw Error("TIME_INPUT: Invalid time zone.");
        }
        const now = new Date();
        const parts = Object.fromEntries(
          formatter.formatToParts(now).map((p) => [p.type, p.value]),
        );
        return {
          timestamp: now.getTime(),
          iso: now.toISOString(),
          timeZone: formatter.resolvedOptions().timeZone,
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}:${parts.second}`,
          weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1,
        };
      },
      "web.fetch": createWebTool(options),
      "web.search": createSearchTool(options),
    },
    BASIC_TOOL_DEFINITIONS,
  );
}
