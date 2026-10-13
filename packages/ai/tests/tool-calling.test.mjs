import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { describeTools, parseFlow } from "soyori-core";
import { createAiTools, createToolExecutionTools, createToolRegistry } from "../dist/index.js";
import { localMessages, localResult } from "../dist/local-tools.js";
import { resolveTools, wireName } from "../dist/tool-calling.js";

function registry() {
  return describeTools(
    {
      "demo.echo": async ({ text }) => ({ text }),
      "demo.fail": async () => {
        throw Error("secret credential");
      },
    },
    {
      "demo.echo": {
        name: "demo.echo",
        inputs: [{ name: "text", valueType: "string", required: true }],
        outputs: [],
      },
      "demo.fail": { name: "demo.fail", inputs: [], outputs: [] },
    },
  );
}
test("batch execution retains IDs, continues failures, rejects forbidden batches before side effects", async () => {
  let runs = 0;
  const tools = registry();
  const original = tools["demo.echo"];
  tools["demo.echo"] = Object.assign(
    async (input) => {
      runs++;
      return original(input);
    },
    { definition: original.definition },
  );
  const execute = createToolExecutionTools({ registry: () => tools })["tools.execute"];
  const calls = [
    { id: "a", target: "demo.fail", inputs: {} },
    { id: "b", target: "demo.echo", inputs: { text: "$literal" } },
  ];
  const result = await execute({
    calls,
    tools: Object.keys(tools),
  });
  assert.equal(result.results[0].error.message.includes("secret"), false);
  assert.deepEqual(result.results[1].result, { text: "$literal" });
  assert.deepEqual(Object.keys(result), ["results"]);
  await assert.rejects(
    execute({ calls: [], tools: [], messages: [] }),
    /Unsupported execution parameter/,
  );
  assert.equal(runs, 1);
  await assert.rejects(
    execute({
      calls: [calls[1], { ...calls[0], target: "not.allowed" }],
      tools: Object.keys(tools),
    }),
    /DENIED/,
  );
  assert.equal(runs, 1);
  await assert.rejects(
    execute({ calls: [calls[1], calls[1]], tools: Object.keys(tools) }),
    /Duplicate/,
  );
  const bad = await execute({
    calls: [{ ...calls[1], inputs: { text: 3 } }],
    tools: Object.keys(tools),
  });
  assert.ok(bad.results[0].error);
  assert.equal(runs, 1);
  assert.deepEqual((await execute({ calls: [], tools: [] })).results, []);
});
test("executor defaults to no extra restriction; explicit lists still restrict targets", async () => {
  const execute = createToolExecutionTools({ registry })["tools.execute"];
  const calls = [{ id: "one", target: "demo.echo", inputs: { text: "hi" } }];
  assert.deepEqual(await execute({ calls }), {
    results: [{ id: "one", target: "demo.echo", result: { text: "hi" } }],
  });
  await assert.rejects(execute({ calls, tools: [] }), /DENIED/);
  await assert.rejects(execute({ calls, tools: ["demo.fail"] }), /DENIED/);
  await assert.rejects(execute({ calls: [{ ...calls[0], target: "unknown" }] }), /Unknown tool/);
  await assert.rejects(execute({ calls, tools: "" }), /unique list/);
});

test("model and executor targets can be exposed and nested execution shares its budget", async () => {
  let definitions;
  const tools = registry();
  const options = {
    registry: () => tools,
    local: async (input) => {
      definitions = input.toolDefinitions;
      return { result: "ok", finishReason: null, usage: null };
    },
  };
  Object.assign(tools, createAiTools(options), createToolExecutionTools(options));
  const targets = ["llm.local", "llm.openai", "llm.anthropic", "tools.execute"];
  assert.deepEqual(
    resolveTools(targets, options).map((tool) => tool.target),
    targets,
  );
  const execute = tools["tools.execute"];
  const nested = {
    id: "outer",
    target: "tools.execute",
    inputs: {
      calls: [{ id: "model", target: "llm.local", inputs: { input: "hi", tools: targets } }],
    },
  };
  const result = await execute({ calls: [nested] });
  assert.equal(result.results[0].result.results[0].result.result, "ok");
  assert.deepEqual(
    definitions.map((tool) => tool.target),
    targets,
  );
  const echo = { id: "echo", target: "demo.echo", inputs: { text: "hi" } };
  for (let i = 0; i < 62; i++) await execute({ calls: [echo] });
  await assert.rejects(execute({ calls: [echo] }), /BUDGET/);
});

test("execution budgets persist across batches; cancellation preserves completed results", async () => {
  const controller = new AbortController();
  const tools = registry();
  tools["demo.echo"] = Object.assign(
    async () => {
      controller.abort();
      return "done";
    },
    { definition: tools["demo.echo"].definition },
  );
  const calls = [1, 2].map((n) => ({ id: String(n), target: "demo.echo", inputs: { text: "x" } }));
  const result = await createToolExecutionTools({
    registry: () => tools,
    signal: controller.signal,
  })["tools.execute"]({ calls, tools: ["demo.echo"] });
  assert.equal(result.results[0].result, "done");
  assert.ok(result.results[1].error);
  const execute = createToolExecutionTools({ registry })["tools.execute"];
  const batch = Array.from({ length: 32 }, (_, i) => ({ ...calls[0], id: String(i) }));
  await execute({ calls: batch, tools: ["demo.echo"] });
  await execute({ calls: batch, tools: ["demo.echo"] });
  await assert.rejects(execute({ calls, tools: ["demo.echo"] }), /BUDGET/);
});
test("Qwen Hermes calls and history preserve requests and reject malformed calls", () => {
  const input = {
    messages: [{ role: "user", content: "echo" }],
    maxTokens: 100,
    toolDefinitions: [
      { target: "demo.echo", name: wireName("demo.echo"), parameters: { type: "object" } },
    ],
  };
  assert.deepEqual(localMessages(input), input.messages);
  const result = localResult(
    `before<tool_call>{"name":"${wireName("demo.echo")}","arguments":{"text":"hi"}}</tool_call><|im_end|>`,
    input,
  );
  assert.equal(result.result, "before");
  assert.equal(result.toolCalls[0].target, "demo.echo");
  assert.deepEqual(result.toolCalls[0].inputs, { text: "hi" });
  assert.equal(result.message.toolCalls[0].id, result.toolCalls[0].id);
  const history = localMessages({
    ...input,
    messages: [
      result.message,
      { role: "tool", content: '{"result":"hi"}', toolCallId: result.toolCalls[0].id },
    ],
  });
  assert.deepEqual(history[0].tool_calls[0].function, {
    name: wireName("demo.echo"),
    arguments: { text: "hi" },
  });
  assert.equal(history[1].role, "tool");
  assert.throws(() => localResult("<tool_call>evil()</tool_call>", input), /Invalid/);
  assert.throws(() => localResult("<tool_call>{", input), /Incomplete/);
  assert.throws(
    () => localResult('<tool_call>{"name":"unknown","arguments":{}}</tool_call>', input),
    /Unknown/,
  );
  assert.deepEqual(localResult("hello", input).toolCalls, []);
  assert.equal(localResult('["ordinary", "answer"]', input).result, '["ordinary", "answer"]');
  const two = localResult(
    `<tool_call>{"name":"${wireName("demo.echo")}","arguments":{}}</tool_call><tool_call>{"name":"${wireName("demo.echo")}","arguments":{}}</tool_call>`,
    input,
  );
  assert.equal(two.toolCalls.length, 2);
});
test("imported flow tools use Core and preserve literal arguments and scope", async () => {
  const child = {
    definition: parseFlow({
      schemaVersion: 1,
      name: "echo",
      fields: { text: { input: true }, answer: { output: true } },
      steps: [{ type: "set", field: "$answer", value: "$text" }],
    }),
    source: "child",
    imports: new Map(),
  };
  const root = {
    definition: parseFlow({ schemaVersion: 1, name: "root", fields: {}, steps: [] }),
    source: "root",
    imports: new Map([["alias.echo", child]]),
  };
  const scope = createToolRegistry({}, root);
  const result = await createToolExecutionTools({ registry: scope.registry })["tools.execute"]({
    calls: [{ id: "one", target: "alias.echo", inputs: { text: "$private" } }],
    tools: ["alias.echo"],
  });
  assert.deepEqual(result.results[0].result, { answer: "$private" });
  await assert.rejects(
    createToolExecutionTools({ registry: scope.registry })["tools.execute"]({
      calls: [],
      tools: ["echo"],
    }),
    /Unknown tool/,
  );
});

for (const provider of ["openai", "anthropic"])
  test(`${provider} requests, execution and continuation use real LangChain protocols`, async (t) => {
    const requests = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      requests.push(data);
      const second = requests.length > 1;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          provider === "openai"
            ? {
                id: "resp",
                object: "chat.completion",
                model: "test",
                choices: [
                  {
                    index: 0,
                    message: second
                      ? { role: "assistant", content: "done" }
                      : {
                          role: "assistant",
                          content: null,
                          tool_calls: [
                            {
                              id: "call_1",
                              type: "function",
                              function: {
                                name: wireName("demo.echo"),
                                arguments: '{"text":"hello"}',
                              },
                            },
                          ],
                        },
                    finish_reason: second ? "stop" : "tool_calls",
                  },
                ],
              }
            : {
                id: "resp",
                type: "message",
                role: "assistant",
                model: "test",
                content: second
                  ? [{ type: "text", text: "done" }]
                  : [
                      {
                        type: "tool_use",
                        id: "call_1",
                        name: wireName("demo.echo"),
                        input: { text: "hello" },
                      },
                    ],
                stop_reason: second ? "end_turn" : "tool_use",
                usage: { input_tokens: 1, output_tokens: 1 },
              },
        ),
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const options = {
      registry,
      local: async () => {
        throw Error("unexpected");
      },
    };
    const ai = createAiTools(options)[`llm.${provider}`];
    const input = {
      input: "echo hello",
      model: "test",
      apiKey: "test",
      tools: ["demo.echo"],
      baseURL: `http://127.0.0.1:${server.address().port}${provider === "openai" ? "/v1" : ""}`,
    };
    const first = await ai(input);
    assert.deepEqual(first.toolCalls, [
      { id: "call_1", target: "demo.echo", inputs: { text: "hello" } },
    ]);
    const execution = await createToolExecutionTools(options)["tools.execute"]({
      calls: first.toolCalls,
      tools: input.tools,
    });
    const second = await ai({
      ...input,
      input: [
        { role: "user", content: "echo hello" },
        first.message,
        ...execution.results.map(({ id, result, error }) => ({
          role: "tool",
          toolCallId: id,
          content: JSON.stringify(error ? { error } : { result }),
        })),
      ],
    });
    assert.equal(second.result, "done");
    assert.deepEqual(second.toolCalls, []);
    const tool = provider === "openai" ? requests[0].tools[0].function : requests[0].tools[0];
    assert.equal(tool.name, wireName("demo.echo"));
    const schema = tool.parameters ?? tool.input_schema;
    assert.deepEqual(schema.required, ["text"]);
    assert.equal(schema.properties.text.type, "string");
    if (provider === "openai") assert.equal(requests[1].messages.at(-1).tool_call_id, "call_1");
    else assert.equal(requests[1].messages.at(-1).content[0].tool_use_id, "call_1");
  });
