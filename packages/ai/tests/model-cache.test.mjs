import assert from "node:assert/strict";
import test from "node:test";
import { AutoConfig, env } from "@huggingface/transformers";
import { LOCAL_MODEL, LOCAL_REVISION } from "../dist/index.js";
import { configureBrowserModelCache } from "../dist/local.js";

test("managed model cache loads through Transformers and never fetches missing files", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    allowLocalModels: env.allowLocalModels,
    allowRemoteModels: env.allowRemoteModels,
    useBrowserCache: env.useBrowserCache,
    useCustomCache: env.useCustomCache,
    customCache: env.customCache,
    fetch: env.fetch,
    useWasmCache: env.useWasmCache,
  };
  const url = `https://huggingface.co/${LOCAL_MODEL}/resolve/${LOCAL_REVISION}/config.json`;
  const files = new Map([[url, JSON.stringify({ model_type: "qwen3", hidden_size: 42 })]]);
  let networkRequests = 0;
  globalThis.fetch = async () => {
    networkRequests++;
    throw Error("Unexpected network request");
  };
  globalThis.caches = {
    open: async () => ({
      match: async (key) => (files.has(key) ? new Response(files.get(key)) : undefined),
    }),
  };
  try {
    await configureBrowserModelCache("test-model-cache");
    const config = await AutoConfig.from_pretrained(LOCAL_MODEL, { revision: LOCAL_REVISION });
    assert.equal(config.hidden_size, 42);
    const discovered = await AutoConfig.from_pretrained(LOCAL_MODEL);
    assert.equal(discovered.hidden_size, 42);
    assert.equal((await env.fetch("https://huggingface.co/missing.json")).status, 404);
    await assert.rejects(
      AutoConfig.from_pretrained("test/missing-model", { revision: LOCAL_REVISION }),
      /Could not locate file/i,
    );
    assert.equal(networkRequests, 0);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
    Object.assign(env, originalEnv);
  }
});
