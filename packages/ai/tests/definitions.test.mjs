import assert from "node:assert/strict";
import test from "node:test";
import { toolParameters } from "soyori-core";
import {
  AI_TOOL_DEFINITIONS,
  createAiTools,
  EXECUTION_TOOL_DEFINITIONS,
  parseInput,
} from "../dist/index.js";
import { createTokenTools, TOKEN_TOOL_DEFINITIONS } from "../dist/tokens.js";

test("executor keeps calls visible and folds its allowlist without accepting conversation input", () => {
  const definition = EXECUTION_TOOL_DEFINITIONS["tools.execute"];
  assert.deepEqual(
    definition.inputs.filter((e) => e.type !== "group").map((e) => e.name),
    ["calls"],
  );
  const group = definition.inputs.find((e) => e.type === "group");
  assert.equal(group.name, "高级设置");
  assert.equal(group.collapsed, true);
  assert.deepEqual(
    toolParameters(definition.inputs).map((e) => e.name),
    ["calls", "tools"],
  );
  assert.deepEqual(
    definition.outputs.map((e) => e.name),
    ["results"],
  );
  const tools = toolParameters(definition.inputs).find((p) => p.name === "tools");
  assert.equal(tools.required, undefined);
  assert.equal(tools.initial, undefined);
});

test("registered tools expose package interfaces without loading models; documented token defaults match runtime", () => {
  const tools = createAiTools({
    local: () => {
      throw new Error("must not run");
    },
  });
  for (const [name, fn] of Object.entries(tools)) {
    assert.equal(fn.definition, AI_TOOL_DEFINITIONS[name]);
    const parameters = toolParameters(fn.definition.inputs);
    assert.equal(parameters.find((p) => p.name === "input").initial, "$chatIn");
    assert.equal(
      parameters.find((p) => p.name === "maxTokens").defaultValue,
      name === "llm.auto"
        ? undefined
        : parseInput({ input: "test" }, name === "llm.local").maxTokens,
    );
    assert.deepEqual(
      toolParameters(fn.definition.outputs).map((p) => p.name),
      ["result", "toolCalls", "message", "finishReason", "usage"],
    );
  }
  const tokens = createTokenTools({
    beforeLoad: () => {
      throw new Error("must not load");
    },
  });
  assert.equal(tokens["tokens.count"].definition, TOKEN_TOOL_DEFINITIONS["tokens.count"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(tools["llm.openai"].definition)),
    AI_TOOL_DEFINITIONS["llm.openai"],
  );
});

test("LLM required inputs stay outside one advanced group and local has no model selector", () => {
  for (const [name, definition] of Object.entries(AI_TOOL_DEFINITIONS)) {
    const local = name === "llm.local";
    assert.deepEqual(
      definition.inputs.filter((entry) => entry.type !== "group").map((entry) => entry.name),
      local ? ["input"] : ["input", "model", "apiKey"],
    );
    const groups = definition.inputs.filter((entry) => entry.type === "group");
    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, "高级设置");
    assert.equal(groups[0].collapsed, true);
    assert.deepEqual(
      groups[0].fields.map((entry) => entry.name),
      local
        ? ["tools", "maxTokens", "temperature"]
        : ["tools", "baseURL", "maxTokens", "temperature", "outputFormat", "jsonSchema"],
    );
    assert.equal(
      toolParameters(definition.inputs).some((entry) => entry.name === "model"),
      !local,
    );
  }
});
