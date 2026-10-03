import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseFlow } from "agent-plan-core";
import { canChat } from "../src/chat-contract.ts";
import { newThread, threadFlow } from "../src/chat-threads.ts";
import { createSession } from "../src/session.ts";

test("starter chat has three variables and returns hello Agent Plan without model calls", async () => {
  const flow = parseFlow(
    JSON.parse(readFileSync(new URL("../src/example.json", import.meta.url), "utf8")),
  );
  assert.deepEqual(Object.keys(flow.fields).sort(), ["chatIn", "chatOut", "memoryKey"]);
  assert.equal(canChat(flow), true);
  const thread = newThread("starter");
  const session = createSession(threadFlow(flow, thread), {
    chatIn: "hello",
    memoryKey: thread.memoryKey,
  });
  await session.runtime.run();
  assert.equal(session.runtime.getState().output.chatOut, "hello Agent Plan");
});
