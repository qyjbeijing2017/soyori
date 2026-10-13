import type { Step } from "./flow.js";
import { prepareFlow } from "./validation.js";

/** Validate one definition and describe its interface without resolving or executing calls. */
export function inspectFlow(value: unknown) {
  const flow = prepareFlow(value);
  const references: { target: string; path: string }[] = [];
  const stepInfo: {
    type: Step["type"];
    path: string;
    description?: string;
    name?: string;
    collapsed?: boolean;
  }[] = [];
  const visit = (steps: Step[], path: string): void => {
    steps.forEach((step, index) => {
      const location = `${path}[${index}]`;
      stepInfo.push({
        type: step.type,
        ...(step.type === "group" ? { name: step.name, collapsed: step.collapsed ?? false } : {}),
        path: location,
        ...(step.description === undefined ? {} : { description: step.description }),
      });
      if (step.type === "call") references.push({ target: step.target, path: location });
      if (step.type === "if") {
        visit(step.then, `${location}.then`);
        visit(step.else ?? [], `${location}.else`);
      }
      if (step.type === "group") visit(step.steps, `${location}.steps`);
      if (step.type === "while") visit(step.body, `${location}.body`);
    });
  };
  visit(flow.steps, "steps");
  return {
    schemaVersion: flow.schemaVersion,
    name: flow.name,
    imports: flow.imports ?? {},
    ...(flow.description === undefined ? {} : { description: flow.description }),
    fields: flow.fields,
    steps: stepInfo,
    references,
  };
}
