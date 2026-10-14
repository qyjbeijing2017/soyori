import { RuntimeError } from "./errors.js";
import { fieldDefinitions } from "./fields.js";
import type { FlowDefinition, JsonValue, LoadedFlow, Step } from "./flow.js";
import { collectReferences, parseReference } from "./operands.js";
import { parseTemplate } from "./template.js";
import { copyJson, isRecord } from "./values.js";

const binaryTypes = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "equal",
  "notEqual",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
]);

function invalid(path: string, message: string): never {
  throw new RuntimeError("INVALID_FLOW", `${path}: ${message}`, path);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(path, "Expected an object.");
  return value;
}

function keys(value: Record<string, unknown>, allowed: string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalid(`${path}.${key}`, "Unknown property.");
  }
}

function description(value: Record<string, unknown>, path: string): void {
  if (Object.hasOwn(value, "description") && typeof value.description !== "string") {
    invalid(`${path}.description`, "Expected a string.");
  }
}

/** Keep a private validated definition so callers cannot change a running program. */
export function prepareFlow(value: unknown): FlowDefinition {
  const flow = record(copyJson(value, "flow"), "flow");
  keys(flow, ["schemaVersion", "name", "imports", "description", "fields", "steps"], "flow");
  description(flow, "flow");
  if (flow.schemaVersion !== 1) invalid("schemaVersion", "Expected version 1.");
  if (typeof flow.name !== "string" || flow.name.length === 0)
    invalid("name", "Expected a nonempty string.");
  if (Object.hasOwn(flow, "imports")) {
    for (const [key, source] of Object.entries(record(flow.imports, "imports"))) {
      if (!key || typeof source !== "string" || !source.trim())
        invalid(`imports.${key}`, "Expected a nonempty alias and source string.");
    }
  }
  const fields: Record<string, unknown> = {};
  const groupMetadata = (value: Record<string, unknown>, path: string) => {
    if (typeof value.name !== "string" || !value.name.trim())
      invalid(`${path}.name`, "Expected a nonempty name.");
    description(value, path);
    if (Object.hasOwn(value, "collapsed") && typeof value.collapsed !== "boolean")
      invalid(`${path}.collapsed`, "Expected a boolean.");
  };
  const definition = (name: string, value: unknown, path: string, named = false) => {
    if (!name.trim()) invalid(path, "Expected a nonempty field name.");
    const item = record(value, path);
    keys(
      item,
      ["initial", "input", "output", "sensitive", "description", ...(named ? ["name"] : [])],
      path,
    );
    description(item, path);
    if (Object.hasOwn(fields, name)) invalid(path, `Duplicate field: ${name}.`);
    for (const flag of ["input", "output", "sensitive"]) {
      if (Object.hasOwn(item, flag) && typeof item[flag] !== "boolean")
        invalid(`${path}.${flag}`, "Expected a boolean.");
    }
    Object.defineProperty(fields, name, { value: item, enumerable: true, configurable: true });
  };
  const declarations = (value: unknown, path: string) => {
    if (!Array.isArray(value)) {
      for (const [name, raw] of Object.entries(record(value, path))) {
        const location = `${path}.${name}`;
        if (!name.trim()) invalid(location, "Expected a nonempty field or group key.");
        const item = record(raw, location);
        if (item.type === "group") {
          keys(item, ["type", "name", "description", "collapsed", "fields"], location);
          groupMetadata(
            { ...item, name: Object.hasOwn(item, "name") ? item.name : name },
            location,
          );
          declarations(item.fields, `${location}.fields`);
        } else definition(name, item, location);
      }
      return;
    }
    value.forEach((raw, index) => {
      const location = `${path}[${index}]`;
      const item = record(raw, location);
      if (item.type === "group") {
        keys(item, ["type", "name", "description", "collapsed", "fields"], location);
        groupMetadata(item, location);
        declarations(item.fields, `${location}.fields`);
      } else {
        if (typeof item.name !== "string" || !item.name.trim())
          invalid(`${location}.name`, "Expected a nonempty field name.");
        definition(item.name, item, location, true);
      }
    });
  };
  declarations(flow.fields, "fields");

  const field = (name: unknown, path: string): void => {
    if (typeof name !== "string") {
      invalid(path, "Expected a $-prefixed destination.");
    }
    try {
      name = parseReference(name as string)[0];
    } catch (error) {
      invalid(path, error instanceof Error ? error.message : "Invalid reference.");
    }
    if (!Object.hasOwn(fields, name as string)) {
      if (Array.isArray(flow.fields)) flow.fields.push({ name });
      else {
        if (Object.hasOwn(flow.fields as object, name as string))
          invalid(path, `Field name conflicts with a group key: ${name}.`);
        Object.defineProperty(flow.fields, name as string, {
          value: {},
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      // Collected roots are own data properties, including names like toString.
      Object.defineProperty(fields, name as string, {
        value: {},
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  };
  const operand = (value: unknown, path: string): void => {
    if (value === undefined) invalid(path, "Missing operand.");
    collectReferences(value as JsonValue, (reference) => field(reference, path));
  };
  const steps = (value: unknown, path: string): void => {
    if (!Array.isArray(value)) invalid(path, "Expected a step array.");
    value.forEach((value: unknown, index) => {
      const location = `${path}[${index}]`;
      const step = record(value, location);
      description(step, location);
      if (typeof step.type !== "string") invalid(location, "Missing step type.");
      if (binaryTypes.has(step.type)) {
        keys(step, ["description", "type", "left", "right", "output"], location);
        operand(step.left, `${location}.left`);
        operand(step.right, `${location}.right`);
        field(step.output, `${location}.output`);
        return;
      }
      switch (step.type) {
        case "group":
          keys(step, ["type", "name", "description", "collapsed", "steps"], location);
          groupMetadata(step, location);
          steps(step.steps, `${location}.steps`);
          break;
        case "call": {
          keys(step, ["description", "type", "target", "inputs", "output", "outputs"], location);
          if (typeof step.target !== "string" || !step.target.trim())
            invalid(`${location}.target`, "Expected a nonempty target name.");
          if (Object.hasOwn(step, "inputs")) {
            for (const [name, source] of Object.entries(
              record(step.inputs, `${location}.inputs`),
            )) {
              operand(source, `${location}.inputs.${name}`);
            }
          }
          if (Object.hasOwn(step, "output") && Object.hasOwn(step, "outputs")) {
            invalid(location, "Specify output or outputs, not both.");
          }
          if (Object.hasOwn(step, "output")) field(step.output, `${location}.output`);
          if (Object.hasOwn(step, "outputs")) {
            const destinations: string[][] = [];
            for (const [name, destination] of Object.entries(
              record(step.outputs, `${location}.outputs`),
            )) {
              field(destination, `${location}.outputs.${name}`);
              const canonical = parseReference(destination as string).map(String);
              if (
                destinations.some((previous) =>
                  previous
                    .slice(0, Math.min(previous.length, canonical.length))
                    .every((part, index) => part === canonical[index]),
                )
              )
                invalid(location, "Multiple outputs cannot write the same or overlapping paths.");
              destinations.push(canonical);
            }
          }
          break;
        }
        case "append":
        case "set":
          keys(step, ["description", "type", "field", "value"], location);
          field(step.field, `${location}.field`);
          operand(step.value, `${location}.value`);
          break;
        case "template":
          keys(step, ["description", "type", "template", "output"], location);
          if (typeof step.template !== "string")
            invalid(`${location}.template`, "Expected template text.");
          try {
            for (const part of parseTemplate(step.template as string)) {
              if ("reference" in part) field(part.reference, `${location}.template`);
            }
          } catch (error) {
            invalid(
              `${location}.template`,
              error instanceof Error ? error.message : "Invalid template.",
            );
          }
          field(step.output, `${location}.output`);
          break;
        case "and":
        case "or":
          keys(step, ["description", "type", "inputs", "output"], location);
          if (!Array.isArray(step.inputs)) invalid(`${location}.inputs`, "Expected an array.");
          if (step.inputs.length === 0) invalid(location, "At least one input is required.");
          step.inputs.forEach((input: unknown, i) => {
            operand(input, `${location}.inputs[${i}]`);
          });
          field(step.output, `${location}.output`);
          break;
        case "not":
          keys(step, ["description", "type", "input", "output"], location);
          operand(step.input, `${location}.input`);
          field(step.output, `${location}.output`);
          break;
        case "if":
          keys(step, ["description", "type", "condition", "then", "else"], location);
          operand(step.condition, `${location}.condition`);
          steps(step.then, `${location}.then`);
          if (Object.hasOwn(step, "else")) steps(step.else, `${location}.else`);
          break;
        case "while":
          keys(step, ["description", "type", "condition", "body"], location);
          operand(step.condition, `${location}.condition`);
          steps(step.body, `${location}.body`);
          break;
        default:
          invalid(location, `Unsupported step type: ${step.type}.`);
      }
    });
  };
  steps(flow.steps, "steps");
  return flow as unknown as FlowDefinition;
}

/** Validate each flow against its own linked imports; cycles are allowed. */
export function validateCalls(flow: LoadedFlow, functions: ReadonlyMap<string, unknown>): void {
  const visit = (steps: Step[], path: string): void => {
    steps.forEach((step, index) => {
      const location = `${path}[${index}]`;
      if (step.type === "call") {
        const child = flow.imports.get(step.target)?.definition;
        if (!child) {
          if (!functions.has(step.target))
            invalid(location, `Unknown call target: ${step.target}.`);
          return;
        }
        const childFields = fieldDefinitions(child.fields);
        for (const name of Object.keys(step.inputs ?? {})) {
          if (!Object.hasOwn(childFields, name) || !childFields[name]!.input) {
            invalid(`${location}.inputs.${name}`, "Target field is not a child input.");
          }
        }
        // Missing output properties map to undefined, including non-output child fields.
      } else if (step.type === "if") {
        visit(step.then, `${location}.then`);
        visit(step.else ?? [], `${location}.else`);
      } else if (step.type === "group") {
        visit(step.steps, `${location}.steps`);
      } else if (step.type === "while") {
        visit(step.body, `${location}.body`);
      }
    });
  };
  for (const key of Object.keys(flow.definition.imports ?? {})) {
    if (!flow.imports.has(key))
      invalid(`imports.${key}`, "Import has not been resolved by the host.");
  }
  for (const key of flow.imports.keys()) {
    if (functions.has(key))
      invalid(`imports.${key}`, `Call target conflicts with a registered function: ${key}.`);
  }
  visit(flow.definition.steps, "steps");
}
