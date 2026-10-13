import assert from "node:assert/strict";
import test from "node:test";
import { createAiTools, selectProvider } from "../dist/index.js";

test("automatic selection honors environment preference, host setting, and complete remote configuration", () => {
  const connections = {
    openai: { model: "gpt", apiKey: "openai-key" },
    anthropic: { model: "claude", apiKey: "anthropic-key" },
  };
  assert.equal(selectProvider({}, {}, connections), "openai");
  assert.equal(selectProvider({}, {}, connections, "anthropic"), "anthropic");
  assert.equal(selectProvider({}, { LLM_PROVIDER: "local" }, connections, "anthropic"), "local");
  assert.equal(selectProvider({}, { LLM_PROVIDER: "auto" }, connections, "anthropic"), "openai");
  assert.equal(
    selectProvider(
      {},
      { OPENAI_API_KEY: "", OPENAI_MODEL: "" },
      { anthropic: connections.anthropic },
    ),
    "anthropic",
  );
  assert.equal(
    selectProvider({}, { ANTHROPIC_MODEL: "claude", ANTHROPIC_API_KEY: "env-key" }),
    "anthropic",
  );
  assert.equal(selectProvider({}, { OPENAI_API_KEY: "partial" }), "local");
  assert.equal(selectProvider({ model: "explicit", apiKey: "explicit-key" }), "openai");
  assert.throws(
    () => selectProvider({}, { LLM_PROVIDER: "invalid-secret" }),
    (error) => /LLM_PROVIDER/.test(error.message) && !error.message.includes("invalid-secret"),
  );
});

test("auto local uses local defaults; pinned missing remote config does not fall back", async () => {
  let calls = 0;
  let maxTokens;
  const local = async (input) => {
    calls++;
    maxTokens = input.maxTokens;
    return { result: "local", finishReason: null, usage: null };
  };
  const tools = createAiTools({ local });
  assert.equal((await tools["llm.auto"]({ input: "hello" })).result, "local");
  assert.equal(maxTokens, 512);
  const pinned = createAiTools({ local, environment: { LLM_PROVIDER: "openai" } });
  await assert.rejects(pinned["llm.auto"]({ input: "hello" }), /AI_CONFIG/);
  assert.equal(calls, 1);
  await assert.rejects(
    tools["llm.auto"]({ input: "hello", outputFormat: "json", jsonSchema: {} }),
    /Unsupported/,
  );
});

test("auto remote failure never invokes local inference or another provider", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response("failure", { status: 401 });
  };
  let localCalls = 0;
  const tools = createAiTools({
    environment: {
      OPENAI_MODEL: "test",
      OPENAI_API_KEY: "secret",
      OPENAI_BASE_URL: "https://unused.example/v1",
      ANTHROPIC_MODEL: "test",
      ANTHROPIC_API_KEY: "secret",
    },
    local: async () => {
      localCalls++;
      throw Error("unexpected");
    },
  });
  await assert.rejects(tools["llm.auto"]({ input: "hello" }), /AI_REQUEST_FAILED/);
  assert.equal(requests, 1);
  assert.equal(localCalls, 0);
});
