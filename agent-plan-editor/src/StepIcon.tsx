import type { Step } from "agent-plan-core";
import { stepCategory } from "./step-model";
import { Icon, type IconName } from "./ui";

const stepIcons: Record<Step["type"], IconName> = {
  set: "nodeSet",
  append: "nodeAppend",
  template: "nodeConcat",
  add: "nodeAdd",
  subtract: "nodeSubtract",
  multiply: "nodeMultiply",
  divide: "nodeDivide",
  equal: "nodeEqual",
  notEqual: "nodeNotEqual",
  greaterThan: "nodeGreater",
  lessThan: "nodeLess",
  greaterThanOrEqual: "nodeGreaterEqual",
  lessThanOrEqual: "nodeLessEqual",
  and: "nodeAnd",
  or: "nodeOr",
  not: "nodeNot",
  if: "nodeIf",
  while: "nodeWhile",
  call: "nodeCall",
};
export function StepIcon({ type }: { type: Step["type"] }) {
  return (
    <span className={`step-icon category-${stepCategory(type)}`} data-step-icon={type}>
      <Icon name={stepIcons[type]} />
    </span>
  );
}
