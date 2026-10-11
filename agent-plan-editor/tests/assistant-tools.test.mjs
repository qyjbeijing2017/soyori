import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { createMemoryTools, createToolExecutionTools } from "agent-plan-ai";
import { createRuntime } from "agent-plan-core";
import { createBrowserStorage } from "agent-plan-storage/browser";
import { createBasicTools } from "agent-plan-tools";
import { initialAiSettings } from "../src/ai-settings.ts";
import { assistantFlow } from "../src/assistant-flow.ts";
import { boundedFlowResult, createAssistantTools } from "../src/assistant-tools.ts";
import { createDocumentation } from "../src/documentation.ts";
import { readFlowFile } from "../src/flow-files.ts";
import { newFile, readFile, writeFiles } from "../src/workspace-files.ts";

function setup(controller = new AbortController(), running = false) {
  let changes = 0;
  const registry = createBasicTools({ signal: controller.signal });
  const options = {
    signal: controller.signal,
    docs: createDocumentation(
      "test",
      [{ id: "guide", path: "docs/guide.md", title: "Guide", group: "test", summary: "Guide" }],
      async () => "# Guide\nUse $ variables.\n",
      async () => [{ path: "docs/guide.md", content: "Use $ variables." }],
    ),
    registry,
    running,
    functions: () => registry,
    changed: () => changes++,
  };
  Object.assign(registry, createAssistantTools(options));
  return { registry, changes: () => changes };
}
test("assistant reads sources, creates and replaces files with atomic stale revision rejection", async () => {
  const { registry: t, changes } = setup();
  assert.equal((await t["project.docs"]({ query: "variables" }))[0].path, "docs/guide.md");
  assert.equal((await t["project.docs"]({ path: "docs/guide.md", limit: 3 })).truncated, true);
  assert.equal((await t["project.tools"]({ name: "workspace.write" })).name, "workspace.write");
  await t["workspace.mkdir"]({ path: "assistant" });
  await t["workspace.write"]({ path: "assistant/readme.md", content: "hello" });
  const read = await t["workspace.read"]({ path: "assistant/readme.md" });
  assert.equal(read.content, "hello");
  await t["workspace.write"]({ path: read.path, content: "changed", revision: read.revision });
  await assert.rejects(
    t["workspace.write"]({ path: read.path, content: "stale", revision: read.revision }),
    /CONFLICT/,
  );
  assert.equal((await readFile(read.path)).id, read.revision.split(":")[0]);
  const file = await readFile(read.path);
  await assert.rejects(
    writeFiles([{ ...file, content: new Blob(["wrong"]) }], true, { [read.path]: read.revision }),
    /CONFLICT/,
  );
  assert.equal(await (await readFile(read.path)).content.text(), "changed");
  await assert.rejects(t["workspace.read"]({ path: "../secret" }), /Invalid workspace path/);
  await writeFiles([newFile("assistant/binary.bin", new Blob([new Uint8Array([0, 255])]))]);
  await assert.rejects(t["workspace.read"]({ path: "assistant/binary.bin" }));
  await t["workspace.copy"]({ path: read.path, directory: "assistant" });
  await t["workspace.move"]({ path: "assistant/readme (2).md", destination: "assistant/copy.md" });
  await t["workspace.delete"]({ path: "assistant/copy.md" });
  assert.equal(await readFile("assistant/copy.md"), undefined);
  assert.equal(changes(), 6);
});
test("assistant creates, validates and runs saved flows with imports and actual tool output", async () => {
  const { registry: t } = setup();
  const child = {
    schemaVersion: 1,
    name: "Child",
    fields: [{ name: "answer", output: true }],
    steps: [{ type: "call", target: "time.now", output: "$answer" }],
  };
  const root = {
    schemaVersion: 1,
    name: "Main",
    imports: { child: "./child.json" },
    fields: [{ name: "answer", output: true }],
    steps: [{ type: "call", target: "child", outputs: { answer: "$answer" } }],
  };
  await t["workspace.write"]({ path: "runs/child.json", content: JSON.stringify(child) });
  await t["workspace.write"]({ path: "runs/main.json", content: JSON.stringify(root) });
  assert.equal((await t["flow.inspect"]({ path: "runs/main.json" })).name, "Main");
  const run = await t["flow.run"]({ path: "runs/main.json" });
  assert.equal(run.status, "completed");
  assert.equal(run.resultAvailable, true);
  assert.equal(typeof run.result.answer.timestamp, "number");
  assert.match(run.output, /answer/);
  assert.ok(run.records.some((record) => record.flow === "Child"));
  const broken = {
    ...child,
    name: "Broken",
    steps: [{ type: "call", target: "missing", output: "$answer" }],
  };
  await t["workspace.write"]({ path: "runs/broken.json", content: JSON.stringify(broken) });
  const failed = await t["flow.run"]({ path: "runs/broken.json" });
  assert.equal(failed.status, "failed");
  assert.ok(failed.error.code);
  await assert.rejects(t["flow.run"]({ path: "runs/main.json", inputs: [] }), /object/);
  await assert.rejects(
    setup(undefined, true).registry["flow.run"]({ path: "runs/main.json" }),
    /FLOW_BUSY/,
  );
});
test("flow verification preserves JSON types and explicitly reports non-JSON or oversized results", () => {
  assert.deepEqual(boundedFlowResult({ answer: 10, ready: false, items: [null, 2] }), {
    resultAvailable: true,
    result: { answer: 10, ready: false, items: [null, 2] },
  });
  assert.deepEqual(boundedFlowResult({ answer: undefined }), {
    resultAvailable: false,
    resultUnavailable: "not-json",
  });
  assert.deepEqual(boundedFlowResult({ text: "x".repeat(16000) }), {
    resultAvailable: false,
    resultUnavailable: "size-limit",
  });
  let accessed = false;
  const value = {
    get answer() {
      accessed = true;
      return 10;
    },
  };
  assert.equal(boundedFlowResult(value).resultAvailable, false);
  assert.equal(accessed, false);
});
test("aborted assistant operations do not mutate workspace", async () => {
  const controller = new AbortController();
  const { registry } = setup(controller);
  controller.abort();
  await assert.rejects(registry["workspace.write"]({ path: "cancelled.md", content: "no" }));
  assert.equal(await readFile("cancelled.md"), undefined);
});

test("new-flow requests need no name, type or format and create unique root files using the editor template", async () => {
  const { registry, changes } = setup();
  const first = await registry["flow.create"]({});
  const second = await registry["flow.create"]({});
  assert.equal(first.path, "新流程.yaml");
  assert.equal(second.path, "新流程 (2).yaml");
  assert.equal(changes(), 2);
  assert.equal(
    readFlowFile(await (await readFile(first.path)).content.text(), first.path).name,
    "新流程",
  );
  const named = await registry["flow.create"]({
    name: "演示",
    directory: "flows",
    description: "测试",
  });
  assert.equal(named.path, "flows/演示.yaml");
  await assert.rejects(registry["flow.create"]({ name: "演示", directory: "flows" }));
  await assert.rejects(registry["flow.create"]({ directory: "../outside" }));
});

test("ordinary assistant tool loop completes docs, save, inspect and run without a second agent engine", async () => {
  const { registry } = setup();
  Object.assign(registry, createMemoryTools(createBrowserStorage("assistant-loop-test")));
  Object.assign(registry, createToolExecutionTools({ registry: () => registry }));
  const flow = {
    schemaVersion: 1,
    name: "LoopCreated",
    fields: [{ name: "answer", output: true }],
    steps: [{ type: "call", target: "time.now", output: "$answer" }],
  };
  const calls = [
    { target: "project.docs", inputs: { path: "docs/guide.md" } },
    {
      target: "workspace.write",
      inputs: { path: "loop/time.json", content: JSON.stringify(flow) },
    },
    { target: "flow.inspect", inputs: { path: "loop/time.json" } },
    { target: "flow.run", inputs: { path: "loop/time.json" } },
  ];
  let round = 0;
  registry["llm.local"] = async ({ input }) => {
    if (round) {
      const result = JSON.parse(input.at(-1).content);
      assert.equal(result.error, undefined);
      if (round === calls.length) assert.equal(result.status, "completed");
    }
    const call = calls[round++];
    const content = call ? "" : "Saved and verified loop/time.json";
    return {
      result: content,
      message: {
        role: "assistant",
        content,
        ...(call ? { toolCalls: [{ id: `call-${round}`, ...call }] } : {}),
      },
    };
  };
  const runtime = createRuntime(
    assistantFlow(initialAiSettings),
    { chatIn: "Create and run a time flow", threadId: "loop" },
    { functions: registry },
  );
  await runtime.run();
  assert.equal(runtime.getState().status, "completed", JSON.stringify(runtime.getState().error));
  assert.equal(round, 5);
  assert.equal(runtime.getState().output.chatOut, "Saved and verified loop/time.json");
});

test("cancelling an in-flight target flow propagates to its host and retains bounded records", async () => {
  const controller = new AbortController();
  let started;
  const pending = new Promise((resolve) => {
    started = resolve;
  });
  const registry = createAssistantTools({
    signal: controller.signal,
    docs: undefined,
    registry: {},
    changed: () => {},
    functions: (_graph, _source, signal) => ({
      "time.now": () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          started();
        }),
    }),
  });
  const run = registry["flow.run"]({ path: "runs/child.json" });
  await pending;
  controller.abort(Error("test cancellation"));
  const result = await run;
  assert.equal(result.status, "cancelled");
  assert.ok(result.records.length <= 100);
});
