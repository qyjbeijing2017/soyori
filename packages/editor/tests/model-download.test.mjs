import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { ModelDownloadManager } from "../src/model-download.ts";
import {
  DOWNLOAD_CHUNK_BYTES,
  downloadFile,
  ModelDownloadStore,
} from "../src/model-download-store.ts";
import {
  MODEL_FILES,
  modelFileURL,
  openManagedModelCache,
  TOKENIZER_FILES,
} from "../src/model-files.ts";

function memoryCache() {
  const values = new Map();
  return {
    match: async (url) => values.get(url)?.clone(),
    delete: async (url) => values.delete(url),
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
  assert.deepEqual(
    new Uint8Array(await (await store.response(file.url, file.size)).arrayBuffer()),
    bytes,
  );
  assert.equal((await store.progress(file.url)).offset, file.size);
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

test("completed legacy chunks need no cache write or network to become usable", async () => {
  const file = { url: "https://test.invalid/quota", size: 123 };
  const bytes = new Uint8Array(file.size).fill(42);
  const store = new ModelDownloadStore();
  await store.append({ ...file, offset: 0 }, bytes);
  const cache = {
    match: async () => undefined,
    put: async () => {
      throw new DOMException("Quota exceeded.", "QuotaExceededError");
    },
  };
  await downloadFile(
    file,
    new ModelDownloadStore(),
    cache,
    new AbortController().signal,
    () => {
      throw Error("must reuse saved chunks");
    },
    () => {},
  );
  assert.deepEqual(
    new Uint8Array(await (await store.response(file.url, file.size)).arrayBuffer()),
    bytes,
  );
  await store.clear(file.url);
});

test("storage estimates stop downloads before network and quota failures are actionable", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "storage");
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const cache = memoryCache();
  let calls = 0;
  globalThis.caches = { open: async () => cache };
  globalThis.fetch = async () => {
    calls++;
    throw Error("unexpected network");
  };
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { estimate: async () => ({ quota: 100, usage: 99 }) },
  });
  try {
    const manager = new ModelDownloadManager();
    await assert.rejects(manager.ensure("tokenizer"), { name: "QuotaExceededError" });
    assert.equal(calls, 0);
    assert.equal(manager.getSnapshot().status, "error");
    assert.equal(manager.getSnapshot().errorKind, "storage-quota");
    // Complete chunks remain usable even when there is no room for another copy.
    const store = new ModelDownloadStore();
    const file = { url: "https://test.invalid/full-quota", size: 2 };
    await store.append({ ...file, offset: 0 }, new Uint8Array(2));
    await downloadFile(
      file,
      store,
      cache,
      new AbortController().signal,
      globalThis.fetch,
      () => {},
    );
    assert.equal((await store.progress(file.url)).offset, 2);
    assert.equal(calls, 0);
    await store.clear(file.url);
  } finally {
    if (descriptor) Object.defineProperty(navigator, "storage", descriptor);
    else delete navigator.storage;
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("restoring completed chunks is ready without promoting them to Cache API", async () => {
  const originalCaches = globalThis.caches;
  const cache = memoryCache();
  globalThis.caches = { open: async () => cache };
  const store = new ModelDownloadStore();
  const last = MODEL_FILES.at(-1);
  const url = modelFileURL(last.path);
  try {
    for (const file of MODEL_FILES.slice(0, -1))
      await cache.put(modelFileURL(file.path), new Response("cached"));
    // Test persisted progress without allocating the 1.4 GB fixture.
    await store.append({ url, size: last.size, offset: last.size - 1 }, new Uint8Array(1));
    const manager = new ModelDownloadManager();
    await manager.restore();
    assert.equal(manager.getSnapshot().loaded, manager.getSnapshot().total);
    assert.equal(manager.getSnapshot().status, "ready");
    await cache.put(url, new Response("cached"));
    await manager.restore();
    assert.equal(manager.getSnapshot().status, "ready");
  } finally {
    await store.clear(url);
    globalThis.caches = originalCaches;
  }
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

test("chunked cache streams disjoint weight ranges across chunk boundaries without copies on disk", async () => {
  const originalCaches = globalThis.caches;
  globalThis.caches = { open: async () => memoryCache() };
  const store = new ModelDownloadStore();
  const file = TOKENIZER_FILES.find((f) => f.size > DOWNLOAD_CHUNK_BYTES);
  const url = modelFileURL(file.path);
  const bytes = Uint8Array.from({ length: file.size }, (_, i) => i % 251);
  try {
    for (let offset = 0; offset < bytes.length; offset += DOWNLOAD_CHUNK_BYTES)
      await store.append(
        { url, size: file.size, offset },
        bytes.slice(offset, offset + DOWNLOAD_CHUNK_BYTES),
      );
    const cache = await openManagedModelCache();
    const ranges = [
      { offset: DOWNLOAD_CHUNK_BYTES - 3, length: 11 },
      { offset: file.size - 4, length: 4 },
      { offset: 0, length: 2 },
    ];
    const expected = Buffer.concat(
      ranges.map(({ offset, length }) => Buffer.from(bytes.slice(offset, offset + length))),
    );
    for (let i = 0; i < 2; i++)
      assert.deepEqual(
        Buffer.from(await (await cache.readRanges(url, ranges)).arrayBuffer()),
        expected,
      );
    assert.deepEqual(new Uint8Array(await (await cache.match(url)).arrayBuffer()), bytes);
    await assert.rejects(
      store.response(url, file.size, [{ offset: file.size, length: 1 }]),
      /Invalid/,
    );
    await store.clear(url);
    assert.equal(await cache.match(url), undefined);
  } finally {
    await store.clear(url);
    globalThis.caches = originalCaches;
  }
});

test("cancel dismisses errors and clear removes only model downloads, then allows a fresh download", async () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const preferences = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => preferences.get(key),
      setItem: (key, value) => preferences.set(key, value),
      removeItem: (key) => preferences.delete(key),
    },
  });
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const cache = memoryCache();
  globalThis.caches = { open: async () => cache };
  const store = new ModelDownloadStore();
  const unrelated = "https://test.invalid/unrelated-user-file";
  const first = TOKENIZER_FILES[0];
  const url = modelFileURL(first.path);
  let requested;
  globalThis.fetch = async (_url, { signal }) => {
    requested?.();
    await new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  };
  try {
    await cache.put(unrelated, new Response("keep me"));
    await cache.put(`${modelFileURL(MODEL_FILES.at(-1).path)}_data`, new Response("old weights"));
    await store.append({ url, size: first.size, offset: 0 }, new Uint8Array(first.size));
    const manager = new ModelDownloadManager();
    const pending = new Promise((resolve) => {
      requested = resolve;
    });
    const downloading = manager.ensure("model");
    const rejected = assert.rejects(downloading);
    await pending;
    await manager.clear();
    await rejected;
    assert.equal(manager.getSnapshot().status, "idle");
    assert.equal(manager.getSnapshot().loaded, 0);
    assert.equal(await store.progress(url), undefined);
    assert.equal(await cache.match(`${modelFileURL(MODEL_FILES.at(-1).path)}_data`), undefined);
    assert.equal(await (await cache.match(unrelated)).text(), "keep me");
    globalThis.fetch = async () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    await assert.rejects(manager.ensure("model"));
    assert.equal(manager.getSnapshot().status, "error");
    manager.stop();
    assert.equal(manager.getSnapshot().status, "stopped");
    assert.equal(manager.getSnapshot().error, "");
    await store.append({ url, size: first.size, offset: 0 }, new Uint8Array(first.size));
    const restored = new ModelDownloadManager();
    await restored.restore();
    assert.equal(restored.getSnapshot().status, "stopped");
    globalThis.fetch = async (address, { headers }) => {
      const file = TOKENIZER_FILES.find((f) => modelFileURL(f.path) === address);
      const [, start, end] = /bytes=(\d+)-(\d+)/.exec(headers.Range).map(Number);
      return rangeResponse(new Uint8Array(file.size), start, end);
    };
    await manager.ensure("tokenizer");
    assert.equal(manager.getSnapshot().status, "ready");
    await manager.clear();
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else delete globalThis.localStorage;
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("clearing during asynchronous cache checks cannot restart a cancelled download", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  let requested;
  let unblock;
  const waiting = new Promise((resolve) => {
    requested = resolve;
  });
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });
  globalThis.caches = {
    open: async () => ({
      match: async () => {
        requested();
        await gate;
        return undefined;
      },
      delete: async () => true,
    }),
  };
  globalThis.fetch = async () => {
    throw Error("cancelled download must not fetch");
  };
  try {
    const manager = new ModelDownloadManager();
    const starting = manager.ensure("model");
    const rejected = assert.rejects(starting, { name: "AbortError" });
    await waiting;
    await manager.clear();
    unblock();
    await rejected;
    assert.equal(manager.getSnapshot().status, "idle");
  } finally {
    unblock();
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});
