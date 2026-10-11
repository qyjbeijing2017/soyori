import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantProvider,
  initialAiSettings,
  loadAiSettings,
  saveAiSettings,
} from "../src/ai-settings.ts";
import { assistantFlow } from "../src/assistant-flow.ts";
import example from "../src/example.json" with { type: "json" };

test("assistant selects configured providers, keeps both model turns consistent, and separates the template", () => {
  const settings = structuredClone(initialAiSettings);
  assert.equal(assistantProvider(settings), "local");
  assert.equal(assistantFlow(settings).steps[1].target, "llm.local");
  settings.anthropic = {
    apiKey: "anthropic-secret",
    model: "test-claude",
    baseURL: "https://example.com",
  };
  assert.equal(assistantProvider(settings), "anthropic");
  settings.openai = {
    apiKey: "openai-secret",
    model: "test-gpt",
    baseURL: "https://example.com/v1",
  };
  assert.equal(assistantProvider(settings), "openai");
  settings.assistantProvider = "anthropic";
  const flow = assistantFlow(settings);
  for (const call of [flow.steps[1], flow.steps[3].body[2]]) {
    assert.equal(call.target, "llm.anthropic");
    assert.equal(call.inputs.model, "test-claude");
    assert.ok(call.inputs.tools.includes("math.clamp"));
    assert.ok(call.inputs.tools.includes("web.search"));
  }
  assert.doesNotMatch(JSON.stringify(flow), /secret/);
  assert.equal(example.steps[1].target, "llm.local");
  assert.notEqual(flow.name, example.name);
  settings.assistantProvider = "local";
  assert.equal(assistantProvider(settings), "local");
  settings.openai.apiKey = settings.anthropic.apiKey = " ";
  settings.assistantProvider = "openai";
  assert.equal(assistantProvider(settings), "local");
});

test("connection settings restore safely without losing background initialization preference", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
  });
  try {
    const settings = structuredClone(initialAiSettings);
    settings.openai.apiKey = "test-key";
    settings.openai.model = "test-model";
    saveAiSettings(settings);
    data.set("agent-plan-background-initialization", "true");
    assert.deepEqual(loadAiSettings(), { ...settings, backgroundInitialization: true });
    data.set("agent-plan-assistant-settings", '{"openai":{"apiKey":42},"assistantProvider":"bad"}');
    assert.equal(loadAiSettings().openai.apiKey, "");
    assert.equal(loadAiSettings().assistantProvider, "auto");
    data.set("agent-plan-assistant-settings", "invalid json");
    assert.deepEqual(loadAiSettings(), initialAiSettings);
  } finally {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete globalThis.localStorage;
  }
});
