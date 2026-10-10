import assert from "node:assert/strict";
import test from "node:test";
import { relativeModulePath } from "../src/code-paths.ts";

test("completion import paths resolve from nested flow and escape URL/quote characters", () => {
  assert.equal(relativeModulePath("flows/chat.yaml", "lib/a.js"), "../lib/a.js");
  assert.equal(relativeModulePath("flows/chat.yaml", "flows/a.js"), "./a.js");
  assert.equal(relativeModulePath("flow.yaml", "a #%.js"), "./a%20%23%25.js");
  assert.equal(relativeModulePath("flow.yaml", "it's.js"), "./it%27s.js");
});
