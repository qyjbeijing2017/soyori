import type { Step } from "agent-plan-core";
export const stepNames: Record<Step["type"], string> = {
  set: "设置数据",
  append: "追加到列表",
  concat: "拼接文字",
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
  if: "条件分支",
  while: "循环",
  call: "调用工具 / 子流程",
};
export function newStep(type: Step["type"]): Step {
  if (type === "set" || type === "append") return { type, field: "$result", value: "" };
  if (type === "concat" || type === "and" || type === "or")
    return { type, inputs: [""], output: "$result" };
  if (type === "not") return { type, input: false, output: "$result" };
  if (type === "if") return { type, condition: true, then: [], else: [] };
  if (type === "while") return { type, condition: false, body: [] };
  if (type === "call")
    return { type, target: { kind: "function", id: "" }, inputs: {}, output: "$result" };
  return { type, left: 1, right: 1, output: "$result" };
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
