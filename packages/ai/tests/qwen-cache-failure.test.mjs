import assert from "node:assert/strict";
import test from "node:test";
import { externalizeOnnx, prepareExternalWeights } from "../dist/onnx-external.js";

test("failed external-data publication leaves the original graph intact", async () => {
  const field = (n, bytes) => {
    const len = bytes.length;
    return Uint8Array.from([
      n * 8 + 2,
      (len % 128) + (len >= 128 ? 128 : 0),
      ...(len >= 128 ? [Math.floor(len / 128)] : []),
      ...bytes,
    ]);
  };
  const tensor = field(9, new Uint8Array(1024).fill(4)),
    graph = field(5, tensor),
    bytes = field(7, graph);
  const url = "https://test.invalid/model_q4f16.onnx";
  const original = new Response(bytes);
  const cache = {
    match: async (key) => (key === url ? original.clone() : undefined),
    put: async () => {
      throw Error("quota");
    },
  };
  await assert.rejects(prepareExternalWeights(cache, url), /quota/);
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
  assert.ok(externalizeOnnx(bytes.buffer, "weights").graph.length < bytes.length);
});
