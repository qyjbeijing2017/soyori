import assert from "node:assert/strict";
import test from "node:test";
import { toolParameters } from "agent-plan-core";
import { AI_TOOL_DEFINITIONS, createAiTools, parseInput } from "../dist/index.js";
import { createTokenTools, TOKEN_TOOL_DEFINITIONS } from "../dist/tokens.js";

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
      parseInput({ input: "test" }, name === "llm.local").maxTokens,
    );
    assert.deepEqual(
      toolParameters(fn.definition.outputs).map((p) => p.name),
      ["result", "finishReason", "usage"],
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
        ? ["maxTokens", "temperature"]
        : ["baseURL", "maxTokens", "temperature", "outputFormat", "jsonSchema"],
    );
    assert.equal(
      toolParameters(definition.inputs).some((entry) => entry.name === "model"),
      !local,
    );
  }
});
