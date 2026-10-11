import assert from "node:assert/strict";
import test from "node:test";
import { createPreview } from "../dist/stream.js";

test("preview hides split tool calls and thinking without leaking their contents", () => {
  const events = [];
  const push = createPreview((e) => events.push(e));
  for (const chunk of [
    "你好",
    "<tool_",
    'call>{"secret":1}',
    "</tool_call>",
    "<think>hidden",
    "</think>完成<|im_",
    "end|>",
  ])
    push(chunk);
  assert.equal(events[0].type, "start");
  assert.equal(events.at(-1).text, "你好完成");
  assert.ok(
    events.filter((e) => e.type === "text").every((e) => !/secret|hidden|tool_|im_/.test(e.text)),
  );
  const second = [];
  createPreview((e) => second.push(e))("new");
  assert.deepEqual(second, [{ type: "start" }, { type: "text", text: "new" }]);
});

import { createServer } from "node:http";
import { createAiTools } from "../dist/index.js";

test("remote SSE streams a preview before the final result without changing result content", async (t) => {
  const events = [];
  let requestedStream = false;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requestedStream = JSON.parse(body).stream;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const content of ["Hello ", "world"]) {
      res.write(
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
      );
      await new Promise((r) => setTimeout(r, 10));
    }
    res.end(
      `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const ai = createAiTools({
    local: async () => {
      throw Error("unexpected");
    },
    stream: (e) => events.push(e),
  });
  const result = await ai["llm.openai"]({
    input: "hi",
    model: "test",
    apiKey: "test",
    baseURL: `http://127.0.0.1:${server.address().port}/v1`,
  });
  assert.equal(requestedStream, true);
  assert.equal(result.result, "Hello world");
  assert.equal(events[0].type, "start");
  assert.deepEqual(
    events.filter((e) => e.type === "text").map((e) => e.text),
    ["Hello ", "Hello world"],
  );
});
