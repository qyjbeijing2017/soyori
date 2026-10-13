import assert from "node:assert/strict";
import test from "node:test";
import { summarize } from "../dist/summary.js";

test("diagnostics safely bound arbitrary values without invoking user hooks", () => {
  let calls = 0;
  const object = { binary: new Uint8Array([1, 2]), empty: undefined, large: "x".repeat(10_000) };
  object.self = object;
  Object.defineProperty(object, "getter", {
    enumerable: true,
    get() {
      calls++;
      return "secret";
    },
  });
  object.proxy = new Proxy(
    {},
    {
      ownKeys() {
        calls++;
        throw new Error("trap");
      },
    },
  );
  const result = JSON.stringify(summarize(object));
  assert.equal(calls, 0);
  assert.match(result, /reference/);
  assert.match(result, /binary/);
  assert.match(result, /accessor/);
  assert.match(result, /proxy/);
  assert.match(result, /truncated/);
  assert.ok(result.length < 2000);
  object.large = "changed";
  assert.doesNotMatch(result, /changed/);
});
