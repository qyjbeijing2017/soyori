import assert from "node:assert/strict";
import test from "node:test";
import { createTokenTools } from "../dist/tokens.js";

test("token estimates explicitly identify uncertainty and never load a model", async () => {
  const count = createTokenTools({
    beforeLoad() {
      throw new Error("must not load");
    },
  })["tokens.count"];
  assert.deepEqual(await count({ input: "abc", mode: "estimate" }), {
    tokens: 3,
    method: "estimate",
    model: null,
  });
  assert.equal((await count({ input: "你好", mode: "estimate" })).tokens, 6);
  assert.equal((await count({ input: "", mode: "estimate" })).tokens, 0);
  assert.ok(
    (await count({ input: [{ role: "user", content: "abc" }], mode: "estimate" })).tokens > 3,
  );
  for (const input of [undefined, null, 42, true, {}])
    await assert.rejects(
      count({ input, mode: "estimate" }),
      /input must be a string or a message array/,
    );
  await assert.rejects(count({ input: [], mode: "estimate" }), /non-empty message array/);
  await assert.rejects(count({ text: "a", mode: "estimate" }), /Unsupported parameter text/);
  await assert.rejects(count({ messages: [], mode: "estimate" }), /Unsupported parameter messages/);
  assert.deepEqual(
    count.definition.inputs.map((field) => field.name),
    ["input", "mode"],
  );
  await assert.rejects(count({ input: "a", mode: "unknown" }), /mode must/);
  await assert.rejects(
    count({ input: [{ role: "tool", content: "a" }] }),
    /system\/user\/assistant/,
  );
});
