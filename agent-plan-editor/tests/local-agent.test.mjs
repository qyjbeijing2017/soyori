import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMemoryTools, createToolExecutionTools } from "agent-plan-ai";
import { parseFlow } from "agent-plan-core";
import { createStorageTools } from "agent-plan-storage";
import { canChat } from "../src/chat-contract.ts";
import { newThread, threadFlow } from "../src/chat-threads.ts";
import { createSession } from "../src/session.ts";

test("starter retains full messages across rounds using storage and memory assembly", async () => {
  const flow = parseFlow(
    JSON.parse(readFileSync(new URL("../src/example.json", import.meta.url), "utf8")),
  );
  assert.equal(canChat(flow), true);
  const thread = newThread("starter");
  let saved;
  const storage = {
    read: async () => ({ value: structuredClone(saved) ?? null, found: Boolean(saved) }),
    write: async (key, value) => {
      assert.equal(key, `memory/${thread.id}`);
      saved = structuredClone(value);
      return { key };
    },
  };
  for (const chatIn of ["first", "second"]) {
    const session = createSession(
      threadFlow(flow, thread),
      { chatIn, threadId: thread.id },
      {
        ...createMemoryTools(storage),
        ...createToolExecutionTools({}),
        ...createStorageTools(storage),
        "llm.local": async ({ input, maxTokens }) => {
          assert.equal(maxTokens, 512);
          assert.equal(input.at(-1).content, chatIn);
          return { result: "reply", message: { role: "assistant", content: "reply" } };
        },
      },
    );
    await session.runtime.run();
    assert.equal(session.runtime.getState().status, "completed");
    assert.equal(session.runtime.getState().output.chatOut, "reply");
  }
  assert.deepEqual(saved, [
    {
      role: "system",
      content: flow.steps.find((s) => s.target === "memory.init").inputs.system,
    },
    { role: "user", content: "first" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "second" },
    { role: "assistant", content: "reply" },
  ]);
});
