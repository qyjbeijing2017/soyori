import assert from "node:assert/strict";
import test from "node:test";
import { createAiTools, resolveConnection } from "../dist/index.js";

test("remote connection uses per-field input > environment > host defaults > official URL", () => {
  for (const provider of ["openai", "anthropic"]) {
    const prefix = provider.toUpperCase();
    const environment = {
      [`${prefix}_MODEL`]: "env-model",
      [`${prefix}_API_KEY`]: "env-secret",
      [`${prefix}_BASE_URL`]: "https://env.example/v1",
    };
    const defaults = {
      model: "default-model",
      apiKey: "default-secret",
      baseURL: "https://default.example/v1",
    };
    assert.deepEqual(
      resolveConnection(
        provider,
        { input: "hello", model: " explicit-model " },
        environment,
        defaults,
      ),
      {
        input: "hello",
        model: "explicit-model",
        apiKey: "env-secret",
        baseURL: "https://env.example/v1",
      },
    );
    assert.equal(
      resolveConnection(
        provider,
        { model: "", apiKey: null, baseURL: undefined },
        environment,
        defaults,
      ).apiKey,
      "env-secret",
    );
    assert.deepEqual(resolveConnection(provider, {}, {}, defaults), defaults);
    assert.equal(
      resolveConnection(provider, {}, { [`${prefix}_API_KEY`]: " " }, defaults).apiKey,
      "default-secret",
    );
    assert.equal(resolveConnection(provider, { apiKey: 123 }, environment).apiKey, 123);
  }
  assert.deepEqual(resolveConnection("openai", {}), { baseURL: "https://api.openai.com/v1" });
  assert.deepEqual(resolveConnection("anthropic", {}), { baseURL: "https://api.anthropic.com" });
});

test("configuration failures expose no secret and local inference ignores remote environment", async () => {
  const tools = createAiTools({
    environment: {
      OPENAI_API_KEY: "hidden-secret",
      OPENAI_MODEL: "",
      OPENAI_BASE_URL: "invalid-hidden-url",
    },
    local: async () => ({ result: "local", finishReason: null, usage: null }),
  });
  await assert.rejects(
    tools["llm.openai"]({ input: "hello" }),
    (error) =>
      /Specify.*model/.test(error.message) &&
      !/hidden-secret|invalid-hidden-url/.test(error.message),
  );
  assert.equal((await tools["llm.local"]({ input: "hello" })).result, "local");
  await assert.rejects(tools["llm.openai"]({ input: "hello", model: 123 }), /AI_INVALID_INPUT/);
});
