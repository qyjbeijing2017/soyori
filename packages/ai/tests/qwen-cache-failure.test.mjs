import assert from "node:assert/strict";
import test from "node:test";
import { externalizeOnnx, prepareExternalWeights } from "../dist/onnx-external.js";

test("ranged virtual external data works even when persistent writes would exceed quota", async () => {
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
    readRanges: async (key, ranges) => {
      assert.equal(key, url);
      return new Response(
        new Blob(ranges.map(({ offset, length }) => bytes.slice(offset, offset + length))),
      );
    },
    put: async () => {
      throw Error("quota");
    },
  };
  const prepared = await prepareExternalWeights(cache, url);
  assert.deepEqual(
    new Uint8Array(await (await prepared.match(`${url}_data`)).arrayBuffer()),
    new Uint8Array(1024).fill(4),
  );
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
  assert.ok(externalizeOnnx(bytes.buffer, "weights").graph.length < bytes.length);
});
