import type { JsonValue, Step } from "agent-plan-core";
import { tr } from "./i18n.ts";
export const stepNames: Record<Step["type"], string> = {
  set: "设置",
  append: "追加",
  concat: "拼接",
  add: "加法",
  subtract: "减法",
  multiply: "乘法",
  divide: "除法",
  equal: "相等",
  notEqual: "不相等",
  greaterThan: "大于",
  lessThan: "小于",
  greaterThanOrEqual: "大于或等于",
  lessThanOrEqual: "小于或等于",
  and: "全部满足",
  or: "任一满足",
  not: "取反",
  if: "条件",
  while: "循环",
  call: "调用",
};
export function stepCategory(
  type: Step["type"],
): "call" | "control" | "data" | "text" | "math" | "logic" {
  if (type === "call") return "call";
  if (type === "if" || type === "while") return "control";
  if (type === "set" || type === "append") return "data";
  if (type === "concat") return "text";
  if (["add", "subtract", "multiply", "divide"].includes(type)) return "math";
  return "logic";
}
export function stepTitle(step: Step): string {
  if (step.type !== "call") return tr(stepNames[step.type]);
  return `${tr("调用")} ${step.target || tr("未选择工具")}`;
}
function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
function brief(value: JsonValue, depth = 0): string {
  if (Array.isArray(value)) {
    if (depth >= 3) return "[…]";
    return `[${value
      .slice(0, 4)
      .map((item) => brief(item, depth + 1))
      .join(", ")}${value.length > 4 ? ", …" : ""}]`;
  }
  if (value && typeof value === "object") {
    if (depth >= 3) return "{…}";
    const entries = Object.entries(value);
    return `{ ${entries
      .slice(0, 4)
      .map(([key, item]) => `${keyText(key)}: ${brief(item, depth + 1)}`)
      .join(", ")}${entries.length > 4 ? ", …" : ""} }`;
  }
  if (typeof value === "string") {
    if (value.startsWith("$") && !value.startsWith("$$")) return value;
    const text = value.startsWith("$$") ? value.slice(1) : value;
    return JSON.stringify(text.length > 100 ? `${text.slice(0, 100)}…` : text);
  }
  return String(value);
}
export function stepSummary(step: Step): string {
  if (step.type === "if" || step.type === "while") return `${step.type} (${brief(step.condition)})`;
  if (step.type === "set") return `${step.field} = ${brief(step.value)}`;
  if (step.type === "append") return `${step.field}.push(${brief(step.value)})`;
  if (step.type === "call") {
    const target = step.target;
    const call = `${target || "…"}(${Object.keys(step.inputs ?? {}).length ? brief(step.inputs ?? {}) : ""})`;
    if (step.output !== undefined) return `${step.output} = ${call}`;
    if (step.outputs && Object.keys(step.outputs).length)
      return `({ ${Object.entries(step.outputs)
        .map(([key, field]) => `${keyText(key)}: ${field}`)
        .join(", ")} } = ${call})`;
    return call;
  }
  if (step.type === "not") return `${step.output} = !${brief(step.input)}`;
  if (step.type === "concat")
    return `${step.output} = concat(${step.inputs.map((input) => brief(input)).join(", ")})`;
  if (step.type === "and" || step.type === "or")
    return `${step.output} = Boolean(${step.inputs.map((input) => brief(input)).join(step.type === "and" ? " && " : " || ")})`;
  // Core equality supports structural/coercing comparisons, unlike JavaScript ===.
  if (step.type === "equal" || step.type === "notEqual")
    return `${step.output} = ${step.type === "notEqual" ? "!" : ""}equal(${brief(step.left)}, ${brief(step.right)})`;
  const operators = {
    add: "+",
    subtract: "-",
    multiply: "*",
    divide: "/",
    greaterThan: ">",
    lessThan: "<",
    greaterThanOrEqual: ">=",
    lessThanOrEqual: "<=",
  };
  return `${step.output} = ${brief(step.left)} ${operators[step.type]} ${brief(step.right)}`;
}
// Empty destinations are editor drafts; Core validates them when applied.
const emptyDestination = "" as `$${string}`;
export function newStep(type: Step["type"]): Step {
  if (type === "set" || type === "append") return { type, field: emptyDestination, value: "" };
  if (type === "concat" || type === "and" || type === "or")
    return { type, inputs: [""], output: emptyDestination };
  if (type === "not") return { type, input: false, output: emptyDestination };
  if (type === "if") return { type, condition: true, then: [], else: [] };
  if (type === "while") return { type, condition: false, body: [] };
  if (type === "call") return { type, target: "", inputs: {}, output: emptyDestination };
  return { type, left: 1, right: 1, output: emptyDestination };
}
export function replaceStep(steps: Step[], path: string, replacement: Step): Step[] {
  return steps.map((step, index) => visit(step, `steps[${index}]`));
  function visit(step: Step, current: string): Step {
    if (current === path) return replacement;
    if (step.type === "if")
      return {
        ...step,
        then: step.then.map((s, i) => visit(s, `${current}.then[${i}]`)),
        ...(step.else ? { else: step.else.map((s, i) => visit(s, `${current}.else[${i}]`)) } : {}),
      };
    if (step.type === "while")
      return { ...step, body: step.body.map((s, i) => visit(s, `${current}.body[${i}]`)) };
    return step;
  }
}

export function removeStep(steps: Step[], path: string, prefix = "steps"): Step[] {
  return steps.flatMap<Step>((step, index) => {
    const current = `${prefix}[${index}]`;
    if (current === path) return [];
    if (step.type === "if")
      return [
        {
          ...step,
          then: removeStep(step.then, path, `${current}.then`),
          ...(step.else ? { else: removeStep(step.else, path, `${current}.else`) } : {}),
        },
      ];
    if (step.type === "while")
      return [{ ...step, body: removeStep(step.body, path, `${current}.body`) }];
    return [step];
  });
}
