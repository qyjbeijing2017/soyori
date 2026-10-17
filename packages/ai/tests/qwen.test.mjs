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
test("virtual external weights preserve bytes without writing a second persistent copy", async () => {
  const url = "https://test.invalid/model_q4f16.onnx";
  const cache = {
    match: async (key) => (key === url ? new Response(original) : undefined),
    put: async () => {
      throw Error("must not persist converted weights");
    },
  };
  const prepared = await prepareExternalWeights(cache, url);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      Buffer.from(await (await prepared.match(`${url}_data`)).arrayBuffer()),
      weights,
    );
    const graph = await prepared.match(url);
    assert.equal(graph.headers.get("x-agent-plan-external-data"), "1");
    assert.ok((await graph.arrayBuffer()).byteLength < original.byteLength);
  }
  assert.deepEqual(Buffer.from(await (await cache.match(url)).arrayBuffer()), original);
  await assert.rejects(
    prepareExternalWeights(
      {
        match: async (key) =>
          key === url
            ? new Response("graph", {
                headers: { "x-agent-plan-external-data": "1" },
              })
            : undefined,
      },
      url,
    ),
    /External weights are missing/,
  );
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
