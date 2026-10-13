import type { Step } from "soyori-core";

export type StepDragPath = (number | string)[];

/** Capture both lists before removing the source, since sibling indices may shift. */
export function moveStepEntry(
  steps: Step[],
  from: StepDragPath,
  parent: StepDragPath,
  index: number,
): Step[] {
  const tree = structuredClone(steps);
  if (!from.length || (parent.length >= from.length && from.every((part, i) => parent[i] === part)))
    return tree;
  function list(path: StepDragPath): Step[] | undefined {
    let items = tree;
    for (let i = 0; i < path.length; i += 2) {
      const step = items[Number(path[i])];
      const branch = path[i + 1];
      if (step?.type === "group" && branch === "steps") items = step.steps;
      else if (step?.type === "while" && branch === "body") items = step.body;
      else if (step?.type === "if" && branch === "then") items = step.then;
      else if (step?.type === "if" && branch === "else") items = step.else ??= [];
      else return undefined;
    }
    return items;
  }
  const source = list(from.slice(0, -1));
  const destination = list(parent);
  const oldIndex = Number(from.at(-1));
  if (!source?.[oldIndex] || !destination) return tree;
  const [entry] = source.splice(oldIndex, 1);
  const position = source === destination && oldIndex < index ? index - 1 : index;
  destination.splice(Math.max(0, Math.min(position, destination.length)), 0, entry);
  return tree;
}
