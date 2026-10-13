import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { ModelDownloadManager } from "../src/model-download.ts";
import {
  DOWNLOAD_CHUNK_BYTES,
  downloadFile,
  ModelDownloadStore,
} from "../src/model-download-store.ts";
import { MODEL_FILES, modelFileURL, TOKENIZER_FILES } from "../src/model-files.ts";

function memoryCache() {
  const values = new Map();
  return {
    match: async (url) => values.get(url)?.clone(),
    put: async (url, response) => {
      const bytes = await response.arrayBuffer();
      values.set(url, new Response(bytes, { headers: response.headers }));
    },
  };
}
function rangeResponse(bytes, start, end) {
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: { "content-range": `bytes ${start}-${end}/${bytes.length}` },
  });
}

test("interrupted downloads resume persisted chunks in a new store and reuse complete cache", async () => {
  const bytes = new Uint8Array(DOWNLOAD_CHUNK_BYTES + 123);
  bytes.fill(13);
  bytes[bytes.length - 1] = 99;
  const file = { url: "https://test.invalid/resume", size: bytes.length };
  const cache = memoryCache();
  const store = new ModelDownloadStore();
  const abort = new AbortController();
  const ranges = [];
  const fetcher = async (_url, { headers, signal }) => {
    ranges.push(headers.Range);
    if (ranges.length === 2 && signal === abort.signal) {
      abort.abort();
      signal.throwIfAborted();
    }
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(headers.Range).map(Number);
    return rangeResponse(bytes, start, end);
  };
  await assert.rejects(downloadFile(file, store, cache, abort.signal, fetcher, () => {}));
  const saved = await store.progress(file.url);
  assert.equal(saved.offset, DOWNLOAD_CHUNK_BYTES);
  await downloadFile(
    file,
    new ModelDownloadStore(),
    cache,
    new AbortController().signal,
    fetcher,
    () => {},
  );
  assert.equal(ranges.at(-1), `bytes=${DOWNLOAD_CHUNK_BYTES}-${bytes.length - 1}`);
  assert.deepEqual(new Uint8Array(await (await cache.match(file.url)).arrayBuffer()), bytes);
  assert.equal(await store.progress(file.url), undefined);
  await downloadFile(
    file,
    store,
    cache,
    new AbortController().signal,
    () => {
      throw Error("network");
    },
    () => {},
  );
});

test("incorrect ranges, ignored resume and incomplete chunks cannot become complete cache entries", async () => {
  const cache = memoryCache();
  const store = new ModelDownloadStore();
  const file = { url: "https://test.invalid/bad", size: 10 };
  await assert.rejects(
    downloadFile(
      file,
      store,
      cache,
      new AbortController().signal,
      async () =>
        new Response(new Uint8Array(9), {
          status: 206,
          headers: { "content-range": "bytes 0-9/10" },
        }),
      () => {},
    ),
    /不完整/,
  );
  assert.equal(await cache.match(file.url), undefined);
  assert.equal(await store.progress(file.url), undefined);
  await assert.rejects(
    downloadFile(
      file,
      store,
      cache,
      new AbortController().signal,
      async () =>
        new Response(new Uint8Array(10), {
          status: 206,
          headers: { "content-range": "bytes 1-10/11" },
        }),
      () => {},
    ),
    /不匹配/,
  );
  await assert.rejects(
    downloadFile(
      { ...file, size: DOWNLOAD_CHUNK_BYTES + 1 },
      store,
      cache,
      new AbortController().signal,
      async () => new Response("ignored"),
      () => {},
    ),
    /分段响应/,
  );
});

test("settings and automatic downloads share pause/resume/stop and restore byte progress", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = memoryCache();
  globalThis.caches = { open: async () => cache };
  let waiting;
  let block = true;
  let calls = 0;
  globalThis.fetch = async (url, { signal, headers }) => {
    calls++;
    if (block) {
      waiting?.();
      await new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    }
    const file = TOKENIZER_FILES.find((f) => modelFileURL(f.path) === url);
    const range = new Headers(headers).get("Range").match(/bytes=(\d+)-(\d+)/);
    const start = Number(range[1]);
    const end = Number(range[2]);
    return new Response(new Uint8Array(end - start + 1), {
      status: 206,
      headers: { "content-range": `bytes ${start}-${end}/${file.size}` },
    });
  };
  try {
    const manager = new ModelDownloadManager();
    const requested = new Promise((resolve) => {
      waiting = resolve;
    });
    const task = manager.ensure("tokenizer");
    await requested;
    manager.pause();
    assert.equal(manager.getSnapshot().status, "paused");
    block = false;
    manager.resume();
    await task;
    assert.equal(manager.getSnapshot().status, "ready");
    const count = calls;
    await manager.ensure("tokenizer");
    assert.equal(calls, count);
    const restored = new ModelDownloadManager();
    await restored.restore();
    assert.equal(
      restored.getSnapshot().loaded,
      TOKENIZER_FILES.reduce((n, f) => n + f.size, 0),
    );
    assert.equal(restored.getSnapshot().status, "paused");
    block = true;
    const nextRequested = new Promise((resolve) => {
      waiting = resolve;
    });
    const cancelled = manager.ensure("model");
    const rejection = assert.rejects(cancelled);
    await nextRequested;
    manager.stop();
    await rejection;
    assert.equal(manager.getSnapshot().status, "stopped");
    assert.equal(MODEL_FILES.length, 6);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});
