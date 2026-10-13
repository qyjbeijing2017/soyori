import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { createToolExecutionTools, createToolRegistry } from "soyori-ai";
import { createRuntime, parseFlow } from "soyori-core";
import { createEnvironmentTools, effectiveEnvironment } from "soyori-storage/environment";
import { createAssistantTools } from "../src/assistant-tools.ts";
import { executionSummary, observeChatTools } from "../src/chat-execution.ts";
import {
  assistantRegistry,
  createEnvironmentManagementTools,
} from "../src/environment-management.ts";
import { environmentStorage, persistEnvironment } from "../src/environment-store.ts";

test("assistant sees only secret status and writes only its conversation", async () => {
  await persistEnvironment({
    TOKEN: { value: "global-secret", sensitive: true },
    EMPTY: { value: "", sensitive: true },
  });
  const tools = createEnvironmentManagementTools(
    { threadId: "env-management-test" },
    new AbortController().signal,
  );
  assert.deepEqual(await tools["env.inspect"]({ name: "MISSING" }), {
    name: "MISSING",
    found: false,
    status: "missing",
  });
  assert.equal((await tools["env.inspect"]({ name: "EMPTY" })).status, "empty");
  assert.doesNotMatch(JSON.stringify(await tools["env.list"]({})), /global-secret/);
  await assert.rejects(
    tools["env.set"]({ name: "TOKEN", value: "new", sensitive: false }),
    /ENV_SENSITIVE/,
  );
  await assert.rejects(
    tools["env.set"]({ name: "TOKEN", value: "new", threadId: "other" }),
    /ENV_INPUT/,
  );
  await Promise.all([
    tools["env.set"]({ name: "TOKEN", value: "thread-secret" }),
    tools["env.set"]({ name: "OTHER", value: "second-secret" }),
  ]);
  const list = await tools["env.list"]({});
  assert.doesNotMatch(JSON.stringify(list), /thread-secret|second-secret/);
  assert.equal(
    (await effectiveEnvironment(environmentStorage, "other")).TOKEN.value,
    "global-secret",
  );
  assert.equal(
    (await effectiveEnvironment(environmentStorage, "env-management-test")).OTHER.value,
    "second-secret",
  );
  const editor = createEnvironmentManagementTools(
    { fileId: "file-test" },
    new AbortController().signal,
  );
  await assert.rejects(editor["env.set"]({ name: "TOKEN", value: "new" }), /ENV_SCOPE/);
});

test("flows use actual credentials while model registry and conversation logs hide them", async () => {
  const functions = createEnvironmentTools({ TOKEN: { value: "actual-secret", sensitive: true } });
  const flow = parseFlow({
    schemaVersion: 1,
    name: "credential-test",
    fields: {
      token: { sensitive: true, output: true },
      ok: { output: true },
    },
    steps: [
      { type: "call", target: "env.get", inputs: { name: "TOKEN" }, outputs: { value: "$token" } },
      { type: "call", target: "check", inputs: { token: "$token" }, output: "$ok" },
    ],
  });
  functions.check = ({ token }) => token === "actual-secret";
  const runtime = createRuntime(flow, {}, { functions });
  await runtime.run();
  assert.equal(runtime.getState().output.ok, true);
  const child = { definition: flow, imports: new Map(), source: "child" };
  const graph = {
    definition: parseFlow({ schemaVersion: 1, name: "parent", fields: {}, steps: [] }),
    imports: new Map([["test", child]]),
    source: "parent",
  };
  const scope = createToolRegistry(functions, graph);
  const model = assistantRegistry(scope.registry());
  assert.equal(Object.hasOwn(model, "env.get"), false);
  assert.deepEqual(await model.test({}), { token: "[sensitive]", ok: true });
  const execute = createToolExecutionTools({ registry: () => model });
  await assert.rejects(
    execute["tools.execute"]({
      calls: [{ id: "1", target: "env.get", inputs: { name: "TOKEN" } }],
    }),
    /Unknown tool/,
  );
  const run = { entries: [], dropped: 0 };
  const management = observeChatTools(
    createEnvironmentManagementTools({ threadId: "log-test" }, new AbortController().signal),
    run,
    () => {},
  );
  await management["env.set"]({ name: "KEY", value: "log-secret" });
  assert.doesNotMatch(JSON.stringify(run), /log-secret/);
  assert.doesNotMatch(
    executionSummary({
      message: { toolCalls: [{ target: "env.set", inputs: { value: "log-secret" } }] },
    }),
    /log-secret/,
  );
});

test("assistant sets then tests saved files using fresh environment with redacted JSON results", async () => {
  const signal = new AbortController().signal;
  const threadId = "saved-environment-test";
  const tools = createEnvironmentManagementTools({ threadId }, signal);
  Object.assign(
    tools,
    createAssistantTools({
      signal,
      registry: tools,
      changed: () => {},
      functions: async () => ({
        ...createEnvironmentTools(await effectiveEnvironment(environmentStorage, threadId)),
        verify: ({ token }) => token === "fresh-secret",
      }),
    }),
  );
  await tools["workspace.write"]({
    path: "environment-test.json",
    content: JSON.stringify({
      schemaVersion: 1,
      name: "saved-environment-test",
      fields: {
        token: { sensitive: true, output: true },
        ok: { output: true },
      },
      steps: [
        {
          type: "call",
          target: "env.get",
          inputs: { name: "TOKEN" },
          outputs: { value: "$token" },
        },
        { type: "call", target: "verify", inputs: { token: "$token" }, output: "$ok" },
      ],
    }),
  });
  await tools["env.set"]({ name: "TOKEN", value: "fresh-secret" });
  const result = await tools["flow.run"]({ path: "environment-test.json" });
  assert.equal(result.status, "completed");
  assert.equal(result.resultAvailable, true);
  assert.deepEqual(result.result, { token: "[sensitive]", ok: true });
  assert.doesNotMatch(JSON.stringify(result), /fresh-secret/);
});
