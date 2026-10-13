import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createAiTools, parseInput } from "../dist/index.js";

test("validates before invoking a model; local calls require no credentials", async () => {
  let received;
  const tools = createAiTools({
    local: async (input) => {
      received = input;
      return { result: "local", finishReason: null, usage: null };
    },
  });
  assert.equal((await tools["llm.local"]({ input: "你好" })).result, "local");
  assert.deepEqual(Object.keys(tools).sort(), [
    "llm.anthropic",
    "llm.auto",
    "llm.local",
    "llm.openai",
  ]);
  assert.equal(received.messages[0].content, "你好");
  assert.equal(received.maxTokens, 512);
  assert.equal(parseInput({ input: "hello" }).maxTokens, 4096);
  assert.equal(parseInput({ input: "hello", maxTokens: 64 }, true).maxTokens, 64);
  assert.equal(parseInput({ input: "hello", maxTokens: 1024 }).maxTokens, 1024);
  const conversation = [
    { role: "system", content: "Be concise" },
    { role: "user", content: "Question" },
    { role: "assistant", content: "Answer" },
    { role: "user", content: "Continue" },
  ];
  assert.deepEqual(parseInput({ input: conversation }).messages, conversation);
  await tools["llm.local"]({ input: conversation });
  assert.deepEqual(received.messages, conversation);
  assert.throws(() => parseInput({ prompt: "old" }), /Unsupported parameter prompt/);
  assert.throws(() => parseInput({ messages: conversation }), /Unsupported parameter messages/);
  for (const invalid of [
    {},
    { input: [] },
    { input: null },
    { input: 42 },
    { input: "  " },
    { input: {} },
    { input: "a", apiKey: 123 },
    { input: "a", maxTokens: 0 },
    { input: "a", temperature: NaN },
    { input: "a", outputFormat: "yaml" },
    { input: "a", outputFormat: "json" },
    { input: "a", outputFormat: "json", jsonSchema: [] },
    { input: "a", jsonSchema: {} },
    { input: [{ role: "tool", content: "x" }] },
  ])
    assert.throws(() => parseInput(invalid), /AI_INVALID_INPUT/);
  assert.throws(() => parseInput({ input: "x", model: "other" }, true), /supports/);
  assert.throws(
    () => parseInput({ input: "x", outputFormat: "json", jsonSchema: {} }, true),
    /Unsupported/,
  );
});

test("real LangChain adapters send vendor protocols and preserve text, content, usage", async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    const body = JSON.parse(raw);
    const structured = body.response_format || body.output_config;
    const prompt = body.messages.at(-1).content;
    const text = prompt === "invalid" ? "not JSON" : structured ? '{"ok":true}' : "你好";
    const truncated = prompt === "truncated";
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/chat/completions")
      res.end(
        JSON.stringify({
          id: "test",
          object: "chat.completion",
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: text },
              finish_reason: truncated ? "length" : "stop",
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
        }),
      );
    else
      res.end(
        JSON.stringify({
          id: "test",
          type: "message",
          role: "assistant",
          model: "test-model",
          content: [{ type: "text", text }],
          stop_reason: truncated ? "max_tokens" : "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 4, output_tokens: 2 },
        }),
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const tools = createAiTools({
    local: async () => {
      throw new Error("unexpected");
    },
  });
  for (const name of ["llm.openai", "llm.anthropic"]) {
    const result = await tools[name]({
      apiKey: "test-secret",
      model: "test-model",
      baseURL: name === "llm.openai" ? `${base}/v1` : base,
      input: [
        { role: "system", content: "简短回答" },
        { role: "user", content: "你好" },
      ],
      maxTokens: 12,
    });
    assert.equal(result.result, "你好");
    assert.equal(result.usage.total_tokens, 6);
    assert.deepEqual(Object.keys(result).sort(), [
      "finishReason",
      "message",
      "result",
      "toolCalls",
      "usage",
    ]);
    assert.doesNotThrow(() => JSON.stringify(result));
  }
  assert.equal(requests[0].headers.authorization, "Bearer test-secret");
  const environmentTools = createAiTools({
    local: async () => {
      throw Error("unexpected local inference");
    },
    environment: {
      OPENAI_MODEL: "env-model",
      OPENAI_API_KEY: "env-secret",
      OPENAI_BASE_URL: `${base}/v1`,
      ANTHROPIC_MODEL: "env-model",
      ANTHROPIC_API_KEY: "env-secret",
      ANTHROPIC_BASE_URL: base,
    },
    connections: {
      openai: {
        model: "ignored-default",
        apiKey: "ignored-default",
        baseURL: "https://unused.example",
      },
    },
  });
  for (const provider of ["openai", "anthropic"]) {
    const response = await environmentTools[`llm.${provider}`]({
      input: "你好",
      model: "",
      apiKey: " ",
      baseURL: "",
    });
    assert.equal(response.result, "你好");
    const request = requests.at(-1);
    assert.equal(request.body.model, "env-model");
    assert.equal(
      provider === "openai" ? request.headers.authorization : request.headers["x-api-key"],
      provider === "openai" ? "Bearer env-secret" : "env-secret",
    );
    assert.doesNotMatch(JSON.stringify(response), /env-secret/);
  }
  assert.equal(requests[1].headers["x-api-key"], "test-secret");
  assert.equal(requests[0].body.messages[0].role, "system");
  assert.equal(requests[1].body.system, "简短回答");
  assert.equal(requests[1].body.max_tokens, 12);
  const jsonSchema = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  };
  for (const name of ["llm.openai", "llm.anthropic"]) {
    const input = {
      input: "Return JSON",
      apiKey: "second-key",
      model: "second-model",
      baseURL: name === "llm.openai" ? `${base}/v1` : base,
      outputFormat: "json",
      jsonSchema,
    };
    const result = await tools[name](input);
    assert.deepEqual(result.result, { ok: true });
    assert.deepEqual(Object.keys(result).sort(), [
      "finishReason",
      "message",
      "result",
      "toolCalls",
      "usage",
    ]);
    const request = requests.at(-1);
    assert.equal(request.body.model, "second-model");
    if (name === "llm.openai") {
      assert.equal(request.headers.authorization, "Bearer second-key");
      assert.deepEqual(request.body.response_format, {
        type: "json_schema",
        json_schema: { name: "result", strict: true, schema: jsonSchema },
      });
    } else {
      assert.equal(request.headers["x-api-key"], "second-key");
      assert.deepEqual(request.body.output_config.format, {
        type: "json_schema",
        schema: jsonSchema,
      });
    }
    await assert.rejects(tools[name]({ ...input, input: "invalid" }), /AI_JSON_OUTPUT/);
    await assert.rejects(tools[name]({ ...input, input: "truncated" }), /AI_JSON_OUTPUT/);
  }
});

test("remote errors never echo credentials; cancellation and missing config fail explicitly", async (t) => {
  const server = createServer((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: { message: "test-secret echoed", type: "invalid_request_error" } }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const options = {
    local: async () => ({ result: "unused", finishReason: null, usage: null }),
  };
  await assert.rejects(
    createAiTools(options)["llm.openai"]({
      input: "hi",
      apiKey: "test-secret",
      model: "model",
      baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    }),
    (error) => /HTTP 401/.test(error.message) && !error.message.includes("test-secret"),
  );
  await assert.rejects(createAiTools(options)["llm.anthropic"]({ input: "hi" }), /AI_CONFIG/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createAiTools({ ...options, signal: controller.signal })["llm.openai"]({
      input: "hi",
      apiKey: "test-secret",
      model: "model",
    }),
    /AI_CANCELLED/,
  );
});
