import assert from "node:assert/strict";
import test from "node:test";
import { localTemplateOptions } from "../dist/local-tools.js";
import { externalizeOnnx, prepareExternalWeights } from "../dist/onnx-external.js";

function v(n) {
  const a = [];
  do {
    const b = n % 128;
    n = Math.floor(n / 128);
    a.push(b + (n ? 128 : 0));
  } while (n);
  return Buffer.from(a);
}
function f(n, b) {
  return Buffer.concat([v(n * 8 + 2), v(b.length), b]);
}
const weights = Buffer.alloc(1025, 42);
const original = Buffer.concat([
  Buffer.from([8, 9]),
  f(7, f(5, Buffer.concat([f(8, Buffer.from("weight")), f(9, weights)]))),
]);
function buffer(b) {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
test("external ONNX preserves weight bytes, metadata and rejects malformed protobuf", async () => {
  const converted = externalizeOnnx(buffer(original), "model_q4f16.onnx_data");
  assert.deepEqual(Buffer.from(await converted.weights.arrayBuffer()), weights);
  assert.ok(Buffer.from(converted.graph).includes(Buffer.from("model_q4f16.onnx_data")));
  assert.ok(Buffer.from(converted.graph).includes(Buffer.from("weight")));
  assert.deepEqual(Array.from(converted.graph.slice(0, 2)), [8, 9]);
  assert.throws(() => externalizeOnnx(buffer(original.subarray(0, 20)), "weights"), /Truncated/);
});
test("prepare publishes weights before graph, is reusable and catches incomplete cache", async () => {
  const url = "https://test.invalid/model_q4f16.onnx",
    map = new Map([[url, new Response(original)]]),
    writes = [];
  const cache = {
    match: async (k) => map.get(k)?.clone(),
    put: async (k, r) => {
      writes.push(k);
      map.set(k, r);
    },
  };
  await prepareExternalWeights(cache, url);
  assert.deepEqual(writes, [`${url}_data`, url]);
  await prepareExternalWeights(cache, url);
  assert.equal(writes.length, 2);
  map.delete(`${url}_data`);
  await assert.rejects(prepareExternalWeights(cache, url), /External weights are missing/);
});
test("Qwen template receives tool schemas with thinking disabled", () => {
  const o = localTemplateOptions({
    messages: [],
    maxTokens: 1,
    toolDefinitions: [{ name: "tool_echo", target: "echo", parameters: { type: "object" } }],
  });
  assert.equal(o.enable_thinking, false);
  assert.equal(o.tools[0].function.name, "tool_echo");
});
