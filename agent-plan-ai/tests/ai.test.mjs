import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createAiTools, parseInput } from "../dist/index.js";

test("validates before invoking a model; local calls require no credentials", async () => {
  let received;
  const tools = createAiTools({
    connection() {
      throw new Error("Must not read credentials");
    },
    local: async (input) => {
      received = input;
      return { text: "local" };
    },
  });
  assert.equal((await tools["local.generate"]({ prompt: "你好" })).text, "local");
  assert.equal(received.messages[0].content, "你好");
  for (const invalid of [
    {},
    { prompt: "a", messages: [] },
    { prompt: "a", apiKey: "secret" },
    { prompt: "a", maxTokens: 0 },
    { prompt: "a", temperature: NaN },
    { messages: [{ role: "tool", content: "x" }] },
  ])
    assert.throws(() => parseInput(invalid), /AI_INVALID_INPUT/);
  assert.throws(() => parseInput({ prompt: "x", model: "other" }, true), /supports/);
});

test("real LangChain adapters send vendor protocols and preserve text, content, usage", async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/chat/completions")
      res.end(
        JSON.stringify({
          id: "test",
          object: "chat.completion",
          model: "test-model",
          choices: [
            { index: 0, message: { role: "assistant", content: "你好" }, finish_reason: "stop" },
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
          content: [{ type: "text", text: "你好" }],
          stop_reason: "end_turn",
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
    connection: (provider) => ({
      apiKey: "test-secret",
      model: "test-model",
      baseURL: provider === "openai" ? `${base}/v1` : base,
    }),
    local: async () => {
      throw new Error("unexpected");
    },
  });
  for (const name of ["openai.generate", "anthropic.generate"]) {
    const result = await tools[name]({
      messages: [
        { role: "system", content: "简短回答" },
        { role: "user", content: "你好" },
      ],
      maxTokens: 12,
    });
    assert.equal(result.text, "你好");
    assert.equal(result.usage.total_tokens, 6);
    assert.ok(result.content);
    assert.doesNotThrow(() => JSON.stringify(result));
  }
  assert.equal(requests[0].headers.authorization, "Bearer test-secret");
  assert.equal(requests[1].headers["x-api-key"], "test-secret");
  assert.equal(requests[0].body.messages[0].role, "system");
  assert.equal(requests[1].body.system, "简短回答");
  assert.equal(requests[1].body.max_tokens, 12);
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
    connection: () => ({
      apiKey: "test-secret",
      model: "model",
      baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    }),
    local: async () => ({ text: "unused" }),
  };
  await assert.rejects(
    createAiTools(options)["openai.generate"]({ prompt: "hi" }),
    (error) => /HTTP 401/.test(error.message) && !error.message.includes("test-secret"),
  );
  await assert.rejects(
    createAiTools({ ...options, connection: () => ({}) })["anthropic.generate"]({ prompt: "hi" }),
    /AI_CONFIG/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createAiTools({ ...options, signal: controller.signal })["openai.generate"]({ prompt: "hi" }),
    /AI_CANCELLED/,
  );
});
