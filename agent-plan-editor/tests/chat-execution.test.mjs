import assert from "node:assert/strict";
import test from "node:test";
import {
  appendExecution,
  executionSummary,
  observeChatTools,
  retainExecutions,
} from "../src/chat-execution.ts";

const run = () => ({
  id: "run",
  threadId: "thread",
  messageIndex: 1,
  status: "running",
  snapshots: false,
  entries: [],
  dropped: 0,
});
test("summaries bound long text and traversal without invoking getters", () => {
  let reads = 0;
  const value = {
    text: "x".repeat(100000),
    get secret() {
      reads++;
      return "secret";
    },
  };
  assert.ok(executionSummary(value).length < 2050);
  assert.equal(reads, 0);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.match(executionSummary(cyclic), /circular/);
});
test("nested tools are observed and failures retain original behavior and definitions", async () => {
  const record = run();
  const inner = Object.assign(
    async () => {
      throw Error("WEB_NETWORK");
    },
    { definition: { name: "web.fetch" } },
  );
  const registry = {
    "web.fetch": inner,
    "tools.execute": async () => {
      try {
        await registry["web.fetch"]({ url: "https://example.com" });
      } catch {
        return { error: "WEB_NETWORK" };
      }
    },
  };
  observeChatTools(registry, record, () => {});
  assert.equal(registry["web.fetch"].definition, inner.definition);
  assert.deepEqual(await registry["tools.execute"]({}), { error: "WEB_NETWORK" });
  assert.equal(record.entries[1].status, "failed");
  assert.match(record.entries[1].error, /WEB_NETWORK/);
  assert.equal(record.entries[0].status, "completed");
  assert.equal(record.entries[0].before, undefined);
});
test("records are bounded across steps and runs", () => {
  const record = run();
  for (let i = 0; i < 200; i++)
    appendExecution(record, {
      label: String(i),
      status: "completed",
      ms: 0,
      output: "x".repeat(4000),
    });
  assert.ok(record.entries.length <= 100);
  assert.ok(JSON.stringify(record.entries).length <= 128000);
  assert.ok(record.dropped > 0);
  const kept = retainExecutions(
    Array.from({ length: 20 }, (_, i) => ({ ...record, id: String(i) })),
  );
  assert.ok(kept.length <= 8);
  assert.ok(JSON.stringify(kept).length <= 512000);
  assert.equal(kept.at(-1).id, "19");
});
