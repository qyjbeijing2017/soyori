import {
  AI_TOOL_DEFINITIONS,
  EXECUTION_TOOL_DEFINITIONS,
  MEMORY_TOOL_DEFINITIONS,
  TOKEN_TOOL_DEFINITIONS,
} from "soyori-ai";
import type { FlowDefinition, JsonValue } from "soyori-core";
import {
  type FieldEntry,
  fieldEntries,
  type ParameterEntry,
  type ToolDefinition,
  toolParameters,
} from "soyori-core";
import { SCRIPT_TOOL_DEFINITION } from "soyori-script";
import { STORAGE_TOOL_DEFINITIONS } from "soyori-storage";
import { ENV_TOOL_DEFINITIONS } from "soyori-storage/environment";
import { BASIC_TOOL_DEFINITIONS } from "soyori-tools";
import { ASSISTANT_TOOL_DEFINITIONS } from "./assistant-tool-definitions.ts";
import { tr } from "./i18n.ts";
import type { CallChoice } from "./library-calls.ts";

export function callTargetGroups(choices: CallChoice[], target: string) {
  const items = [
    ...Object.keys(tools).map((value) => ({ value, label: value, disabled: false })),
    ...choices.map((choice) => ({
      value: choice.alias,
      label: choice.label,
      disabled: Boolean(choice.unavailable),
    })),
  ];
  if (target && !items.some((item) => item.value === target))
    items.push({ value: target, label: `${target} (${tr("不可用")})`, disabled: true });
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const separator = item.value.indexOf(".");
    const namespace = separator < 0 ? "" : item.value.slice(0, separator);
    const group = groups.get(namespace) ?? [];
    group.push({
      ...item,
      label: `${item.value.slice(separator + 1)}${item.disabled ? ` (${tr("不可用")})` : ""}`,
    });
    groups.set(namespace, group);
  }
  return Array.from(groups, ([namespace, items]) => ({
    group: namespace || tr("全局"),
    items,
  }));
}

export const toolDefinitions: Record<string, ToolDefinition> = {
  ...ASSISTANT_TOOL_DEFINITIONS,
  "script.run": SCRIPT_TOOL_DEFINITION,
  ...BASIC_TOOL_DEFINITIONS,
  ...AI_TOOL_DEFINITIONS,
  ...TOKEN_TOOL_DEFINITIONS,
  ...STORAGE_TOOL_DEFINITIONS,
  ...ENV_TOOL_DEFINITIONS,
  ...MEMORY_TOOL_DEFINITIONS,
  ...EXECUTION_TOOL_DEFINITIONS,
};
export const tools: Record<string, Record<string, JsonValue>> = Object.fromEntries(
  Object.entries(toolDefinitions).map(([name, definition]) => [
    name,
    Object.fromEntries(
      toolParameters(definition.inputs)
        .filter((field) => field.initial !== undefined)
        .map((field) => [field.name, field.initial!]),
    ),
  ]),
);
export function callParameterEntries(
  target: string,
  direction: "inputs" | "outputs",
  flow?: FlowDefinition,
): ParameterEntry[] {
  if (Object.hasOwn(toolDefinitions, target)) return toolDefinitions[target][direction];
  const visit = (entries: FieldEntry[]): ParameterEntry[] =>
    entries.flatMap<ParameterEntry>((entry) => {
      if (entry.type === "group") {
        const fields = visit(entry.fields);
        return fields.length ? [{ ...entry, fields }] : [];
      }
      if (!entry[direction === "inputs" ? "input" : "output"]) return [];
      return [
        {
          name: entry.name,
          description: entry.description,
          ...(entry.initial === undefined ? {} : { defaultValue: entry.initial }),
        },
      ];
    });
  return flow ? visit(fieldEntries(flow.fields)) : [];
}
export function callParameterPlaceholder(
  target: string,
  name: string,
  flow?: FlowDefinition,
): string | undefined {
  const field = toolParameters(callParameterEntries(target, "inputs", flow)).find(
    (f) => f.name === name,
  );
  if (field?.placeholder !== undefined) return tr(field.placeholder);
  if (field?.defaultValue !== undefined)
    return typeof field.defaultValue === "string"
      ? field.defaultValue
      : JSON.stringify(field.defaultValue);
  return undefined;
}
export function callParameterNames(
  target: string,
  flow?: FlowDefinition,
): readonly string[] | null {
  return Object.hasOwn(toolDefinitions, target) || flow
    ? toolParameters(callParameterEntries(target, "inputs", flow)).map((field) => field.name)
    : null;
}
export function restrictCallInputs(
  inputs: Record<string, JsonValue>,
  names: readonly string[],
): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(inputs).filter(([name]) => names.includes(name)));
}

export function callOutputNames(target: string, flow?: FlowDefinition): readonly string[] {
  return toolParameters(callParameterEntries(target, "outputs", flow)).map((field) => field.name);
}
export function callOutputDestinations(
  step: { output?: string; outputs?: Record<string, string> },
  names: readonly string[],
): Record<string, `$${string}`> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      (step.output
        ? `${step.output}[${JSON.stringify(name)}]`
        : (step.outputs?.[name] ?? "")) as `$${string}`,
    ]),
  );
}
