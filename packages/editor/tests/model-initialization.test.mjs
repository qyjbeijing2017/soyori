import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/packages/editor/src/")) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
});
const { BrowserAiHost, initialAiSettings } = await import("../src/ai-host.ts");
const { newFile, writeFiles } = await import("../src/workspace-files.ts");
hook.deregister();

test("browser searches use file/thread runtime credentials and later environment overrides without model initialization", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (address, options) => {
    requests.push({ url: String(address), headers: options.headers });
    return Response.json(
      String(address).includes("bocha.cn")
        ? {
            code: 200,
            data: {
              webPages: {
                value: [{ name: "source", url: "https://example.com", snippet: "found" }],
              },
            },
          }
        : { results: [{ title: "source", url: "https://example.com", content: "found" }] },
    );
  });
  const host = new BrowserAiHost();
  const tools = host.tools(
    initialAiSettings,
    new AbortController().signal,
    () => {},
    undefined,
    undefined,
    undefined,
    false,
    {
      SEARCH_PROVIDER: { value: "bocha", sensitive: false },
      BOCHA_API_KEY: { value: "browser-search-key", sensitive: true },
    },
  );
  assert.equal((await tools["web.search"]({ query: "test" })).results[0].snippet, "found");
  assert.equal(requests[0].headers.get("authorization"), "Bearer browser-search-key");
  await tools["env.override"]({ name: "SEARCH_PROVIDER", value: "tavily", sensitive: false });
  await tools["env.override"]({ name: "TAVILY_API_KEY", value: "runtime-search-key" });
  await tools["web.search"]({ query: "test" });
  assert.equal(requests[1].url, "https://api.tavily.com/search");
  assert.equal(requests[1].headers.get("authorization"), "Bearer runtime-search-key");
  assert.equal(host.getSnapshot().status, "idle");
});

test("remote calls use settings credentials and endpoints without initializing the local worker", async () => {
  const originalFetch = globalThis.fetch;
  const settings = structuredClone(initialAiSettings);
  settings.openai = {
    apiKey: "test-openai",
    model: "test-gpt",
    baseURL: "https://openai.example/v1",
  };
  settings.anthropic = {
    apiKey: "test-anthropic",
    model: "test-claude",
    baseURL: "https://anthropic.example",
  };
  const host = new BrowserAiHost();
  const requests = [];
  globalThis.fetch = async (address, options) => {
    const request = address instanceof Request ? address : new Request(address, options);
    const body = await request.json();
    requests.push({ url: request.url, body, headers: request.headers });
    const anthropic = request.url.includes("anthropic.example");
    return new Response(
      JSON.stringify(
        anthropic
          ? {
              id: "msg_test",
              type: "message",
              role: "assistant",
              model: body.model,
              content: [{ type: "text", text: "remote reply" }],
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 2 },
            }
          : {
              id: "chatcmpl-test",
              object: "chat.completion",
              model: body.model,
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "remote reply" },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
            },
      ),
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    const tools = host.tools(settings, new AbortController().signal, () => {});
    assert.equal((await tools["llm.openai"]({ input: "hello" })).result, "remote reply");
    assert.equal((await tools["llm.anthropic"]({ input: "hello" })).result, "remote reply");
    assert.equal(requests[0].url, "https://openai.example/v1/chat/completions");
    assert.equal(requests[0].headers.get("authorization"), "Bearer test-openai");
    assert.equal(requests[0].body.model, "test-gpt");
    assert.equal(requests[1].url, "https://anthropic.example/v1/messages");
    assert.equal(requests[1].headers.get("x-api-key"), "test-anthropic");
    assert.equal(requests[1].body.model, "test-claude");
    assert.equal(host.getSnapshot().status, "idle");
    await tools["llm.openai"]({ input: "hello", apiKey: "override", model: "other" });
    assert.equal(requests[2].headers.get("authorization"), "Bearer override");
    assert.equal(requests[2].body.model, "other");
    const environment = {
      OPENAI_API_KEY: { value: "env-openai", sensitive: true },
      OPENAI_MODEL: { value: "env-gpt", sensitive: false },
      OPENAI_BASE_URL: { value: "https://openai.example/env", sensitive: false },
      ANTHROPIC_API_KEY: { value: "env-anthropic", sensitive: true },
      ANTHROPIC_MODEL: { value: "env-claude", sensitive: false },
    };
    const envTools = host.tools(
      settings,
      new AbortController().signal,
      () => {},
      undefined,
      undefined,
      undefined,
      false,
      environment,
    );
    await envTools["llm.openai"]({ input: "hello" });
    assert.equal(requests[3].headers.get("authorization"), "Bearer env-openai");
    assert.equal(requests[3].body.model, "env-gpt");
    assert.equal(requests[3].url, "https://openai.example/env/chat/completions");
    await envTools["llm.anthropic"]({ input: "hello" });
    assert.equal(requests[4].headers.get("x-api-key"), "env-anthropic");
    assert.equal(requests[4].body.model, "env-claude");
    settings.assistantProvider = "openai";
    const autoTools = host.tools(
      settings,
      new AbortController().signal,
      () => {},
      undefined,
      undefined,
      undefined,
      false,
      {
        ...environment,
        LLM_PROVIDER: { value: "anthropic", sensitive: false },
      },
    );
    const autoResponse = await autoTools["llm.auto"]({ input: "hello" });
    assert.equal(autoResponse.result, "remote reply");
    assert.equal(requests[5].headers.get("x-api-key"), "env-anthropic");
    assert.equal(requests[5].body.model, "env-claude");
    await autoTools["env.override"]({ name: "ANTHROPIC_MODEL", value: "runtime-claude" });
    await autoTools["llm.auto"]({ input: "hello" });
    assert.equal(requests[6].body.model, "runtime-claude");
    await writeFiles([
      newFile(
        "host-env-test.json",
        new Blob([JSON.stringify({ ANTHROPIC_API_KEY: "loaded-key" })]),
      ),
    ]);
    await autoTools["env.load"]({ path: "./host-env-test.json" });
    await autoTools["llm.auto"]({ input: "hello" });
    assert.equal(requests[7].headers.get("x-api-key"), "loaded-key");
    await assert.rejects(
      autoTools["env.load"]({ path: "https://example.com/env.json" }),
      /ENV_SOURCE/,
    );
    assert.equal(host.getSnapshot().status, "idle");
  } finally {
    globalThis.fetch = originalFetch;
    host.dispose();
  }
});

class FakeWorker {
  static instances = [];
  messages = [];
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(input) {
    this.messages.push(input);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data) {
    this.onmessage?.({ data });
  }
}

test("background initialization is shared, warms without generating, and release resets it", async () => {
  const oldWorker = globalThis.Worker;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  globalThis.Worker = FakeWorker;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { gpu: { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) } },
  });
  try {
    assert.equal(initialAiSettings.backgroundInitialization, false);
    const host = new BrowserAiHost();
    host.downloads.ensure = async () => {};
    const statuses = [];
    host.subscribe(() => statuses.push(host.getSnapshot().status));
    const first = host.initialize();
    assert.equal(host.initialize(), first);
    await new Promise(setImmediate);
    const worker = FakeWorker.instances.at(-1);
    assert.deepEqual(worker.messages, [{ type: "initialize" }]);
    const controller = new AbortController();
    const tools = host.tools(initialAiSettings, controller.signal, () => {});
    const generation = tools["llm.local"]({ input: "hello" });
    worker.reply({ type: "initialized" });
    await first;
    await new Promise(setImmediate);
    assert.equal(FakeWorker.instances.at(-1), worker);
    assert.equal(worker.messages.length, 2);
    assert.equal(worker.messages[1].messages.at(-1).content, "hello");
    worker.reply({ type: "result", result: { result: "hello", finishReason: null, usage: null } });
    assert.equal((await generation).result, "hello");
    assert.equal(host.getSnapshot().status, "ready");
    await host.initialize();
    assert.equal(worker.messages.length, 2);
    host.dispose();
    assert.equal(worker.terminated, true);
    assert.deepEqual(statuses, ["initializing", "ready", "idle"]);
    const canceled = host.initialize();
    await new Promise(setImmediate);
    const interrupted = FakeWorker.instances.at(-1);
    const rejection = assert.rejects(canceled, /取消/);
    host.cancelInitialization();
    await rejection;
    assert.equal(interrupted.terminated, true);
    assert.equal(host.getSnapshot().status, "idle");
    const retry = host.initialize();
    await new Promise(setImmediate);
    FakeWorker.instances.at(-1).reply({ type: "error", message: "Session failed" });
    await assert.rejects(retry, /Session failed/);
    assert.equal(host.getSnapshot().status, "error");
    assert.match(host.getSnapshot().error, /Session failed/);
    host.dispose();
  } finally {
    globalThis.Worker = oldWorker;
    Object.defineProperty(globalThis, "navigator", oldNavigator);
  }
});
