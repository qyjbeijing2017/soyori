import assert from "node:assert/strict";
import test from "node:test";
import { parseFlow } from "agent-plan-core";
import { parse } from "yaml";
import { canChat, enableChat, formatChatOutput, upgradeDefaultChat } from "../src/chat-contract.ts";
import { createSession } from "../src/session.ts";

test("any user flow with chatOut output can run as a conversation", async () => {
  const flow = parseFlow({
    schemaVersion: 1,
    name: "用户流程",
    fields: { chatIn: { input: true }, chatOut: { output: true } },
    steps: [{ type: "template", template: "收到：$chatIn$", output: "$chatOut" }],
  });
  assert.equal(canChat(flow), true);
  const session = createSession(flow, { chatIn: "你好" });
  await session.runtime.run();
  assert.equal(session.runtime.getState().output.chatOut, "收到：你好");
  for (const fields of [
    { text: { input: true } },
    { text: { output: true } },
    { prompt: { input: true }, answer: { output: true } },
  ]) {
    assert.equal(canChat({ ...flow, fields }), false);
  }
});
test("built-in chat migration preserves edits and uses ordinary core steps", async () => {
  const original = parseFlow({
    schemaVersion: 1,
    name: "修改过的名字",
    fields: {
      prompt: { input: true, initial: "旧默认" },
      answer: { output: true },
      memoryKey: { initial: "existing/key" },
    },
    steps: [{ type: "template", template: "已修改：$prompt$", output: "$answer" }],
  });
  const upgraded = parseFlow(upgradeDefaultChat(original));
  assert.equal(canChat(upgraded), true);
  assert.equal(upgraded.name, original.name);
  assert.equal(upgraded.fields.memoryKey.initial, "existing/key");
  assert.equal(original.fields.text, undefined);
  const session = createSession(upgraded, { chatIn: "新输入" });
  await session.runtime.run();
  assert.equal(session.runtime.getState().output.chatOut, "已修改：新输入");
  assert.equal(upgradeDefaultChat(upgraded), upgraded);
});

test("enabling chat adds the contract and preserves existing fields and steps", () => {
  for (const fields of [
    { count: { initial: 1 } },
    { text: { initial: "hello", description: "keep", input: false } },
  ]) {
    const original = parseFlow({ schemaVersion: 1, name: "flow", fields, steps: [] });
    const snapshot = structuredClone(original);
    const enabled = parseFlow(enableChat(original));
    assert.equal(canChat(enabled), true);
    assert.equal(enabled.fields.chatIn.input, true);
    assert.equal(enabled.fields.threadId.input, true);
    assert.equal(enabled.fields.chatOut.output, true);
    assert.deepEqual(enabled.steps, original.steps);
    assert.deepEqual(original, snapshot);
    assert.equal(enableChat(enabled), enabled);
  }
});

test("chatOut alone is enough and thread host supplies inputs even when undeclared", async () => {
  const { newThread, threadFlow } = await import("../src/chat-threads.ts");
  const flow = {
    schemaVersion: 1,
    name: "minimal",
    fields: { chatOut: { output: true } },
    steps: [{ type: "template", template: "$chatIn$:$threadId$", output: "$chatOut" }],
  };
  assert.equal(canChat(flow), true);
  const first = newThread("minimal"),
    second = newThread("minimal");
  for (const thread of [first, first, second]) {
    const session = createSession(threadFlow(flow, thread), {
      chatIn: "hello",
      threadId: thread.id,
    });
    await session.runtime.run();
    assert.equal(session.runtime.getState().output.chatOut, `hello:${thread.id}`);
  }
  assert.notEqual(first.id, second.id);
  assert.equal(flow.fields.chatIn, undefined);
});

test("chat displays all JSON output types and retains literal strings", async () => {
  for (const value of [
    0,
    42,
    false,
    true,
    null,
    [],
    {},
    ["one", 2],
    { count: 2, keys: [] },
    "{literal}",
    "",
  ]) {
    const flow = parseFlow({
      schemaVersion: 1,
      name: "output",
      fields: { chatOut: { output: true, initial: value } },
      steps: [],
    });
    const session = createSession(flow, {});
    await session.runtime.run();
    const text = formatChatOutput(session.runtime.getState().output.chatOut);
    if (typeof value === "string") assert.equal(text, value);
    else assert.deepEqual(parse(text), value);
    assert.equal(JSON.parse(JSON.stringify({ content: text })).content, text);
  }
  assert.equal(formatChatOutput(["one", "two"]), "- one\n- two");
  assert.equal(formatChatOutput({ count: 2 }), "count: 2");
  assert.equal(formatChatOutput(undefined), "undefined");
  const circular = {};
  circular.self = circular;
  assert.match(formatChatOutput(circular), /circular reference/);
});
