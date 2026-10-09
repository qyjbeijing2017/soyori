import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseFlow } from "agent-plan-core";
import { canChat } from "../src/chat-contract.ts";
import { newThread, threadFlow } from "../src/chat-threads.ts";
import { createSession } from "../src/session.ts";

for (const compress of [false, true])
  test(`starter persists local memory, compression=${compress}`, async () => {
    const flow = parseFlow(
      JSON.parse(readFileSync(new URL("../src/example.json", import.meta.url), "utf8")),
    );
    assert.equal(Object.keys(flow.fields).length, 9);
    assert.equal(canChat(flow), true);
    const thread = newThread("starter");
    let saved;
    let round = 0;
    let compressions = 0;
    for (const chatIn of ["first", "second"]) {
      round++;
      const session = createSession(
        threadFlow(flow, thread),
        { chatIn, threadId: thread.id },
        {
          "storage.read": async () => ({ value: structuredClone(saved), found: Boolean(saved) }),
          "storage.write": async ({ key, value }) => {
            assert.equal(key, `memory/${thread.id}`);
            saved = structuredClone(value);
            return { key };
          },
          "tokens.count": async ({ input, mode }) => {
            assert.equal(mode, "local");
            assert.equal(input.at(-1).content, chatIn);
            return { tokens: compress && round === 2 ? 900 : 100 };
          },
          "llm.local": async (input) => {
            assert.equal(input.model, undefined);
            assert.equal(input.apiKey, undefined);
            if (typeof input.input === "string") {
              compressions++;
              assert.match(input.input, /first/);
              assert.equal(input.maxTokens, 256);
              return { result: "summary" };
            }
            assert.equal(input.maxTokens, 512);
            assert.equal(input.input.at(-1).content, chatIn);
            return { result: "reply" };
          },
        },
      );
      await session.runtime.run();
      assert.equal(session.runtime.getState().status, "completed");
      assert.equal(session.runtime.getState().output.chatOut, "reply");
    }
    assert.equal(compressions, compress ? 1 : 0);
    assert.deepEqual(
      saved,
      compress
        ? [
            { role: "user", content: "summary" },
            { role: "user", content: "second" },
            { role: "assistant", content: "reply" },
          ]
        : [
            { role: "user", content: "first" },
            { role: "assistant", content: "reply" },
            { role: "user", content: "second" },
            { role: "assistant", content: "reply" },
          ],
    );
  });
