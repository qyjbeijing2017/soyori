import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("local worker forwards request failures and unhandled loader rejections to the host", async () => {
  const source = readFileSync(new URL("../src/local-model.worker.ts", import.meta.url), "utf8");
  const messages = [];
  const listeners = new Map();
  const scope = {
    postMessage: (message) => messages.push(message),
    addEventListener: (name, listener) => listeners.set(name, listener),
  };
  runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\r?$/gm, "")), {
    self: scope,
    Error,
    wasm: "test.wasm",
    mjs: "test.mjs",
    navigator: { gpu: { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) } },
    configureManagedModelCache: async () => {},
    createLocalModel: () => ({
      initialize: async () => {
        throw Error("request failure");
      },
    }),
  });
  await scope.onmessage({ data: { type: "initialize" } });
  assert.equal(messages[0].type, "error");
  assert.equal(messages[0].message, "request failure");
  let prevented = false;
  listeners.get("unhandledrejection")({
    reason: Error("background loader failure"),
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(messages[1].type, "error");
  assert.equal(messages[1].message, "background loader failure");
});
