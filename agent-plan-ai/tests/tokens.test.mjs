import assert from "node:assert/strict";
import test from "node:test";
import { createTokenTools } from "../dist/tokens.js";

test("token estimates explicitly identify uncertainty and never load a model", async () => {
  const count = createTokenTools({
    beforeLoad() {
      throw new Error("must not load");
    },
  })["tokens.count"];
  assert.deepEqual(await count({ text: "abc", mode: "estimate" }), {
    tokens: 3,
    method: "estimate",
    model: null,
  });
  assert.equal((await count({ text: "你好", mode: "estimate" })).tokens, 6);
  assert.equal((await count({ text: "", mode: "estimate" })).tokens, 0);
  assert.ok(
    (await count({ messages: [{ role: "user", content: "abc" }], mode: "estimate" })).tokens > 3,
  );
  await assert.rejects(count({ text: "a", messages: [] }), /Provide text or messages/);
  await assert.rejects(count({ text: "a", mode: "unknown" }), /mode must/);
  await assert.rejects(
    count({ messages: [{ role: "tool", content: "a" }] }),
    /system\/user\/assistant/,
  );
});
