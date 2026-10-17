const DB_NAME = "agent-plan-model-downloads";
export const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export interface FileProgress {
  url: string;
  size: number;
  offset: number;
}

// Complete files stay in the resumable chunk store; no second full-file copy.
// Estimates are advisory and may be unavailable.
async function checkStorageSpace(size: number, offset: number) {
  const storage = globalThis.navigator?.storage;
  const estimate = await storage?.estimate?.().catch(() => undefined);
  if (estimate?.quota === undefined || estimate.usage === undefined) return;
  if (estimate.quota - estimate.usage < size - offset)
    throw new DOMException(
      "Insufficient storage for remaining model download.",
      "QuotaExceededError",
    );
}

export function isStorageQuotaError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "QuotaExceededError";
}
function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? Error("Download storage aborted."));
  });
}
export class ModelDownloadStore {
  private database?: Promise<IDBDatabase>;
  private open() {
    this.database ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("files", { keyPath: "url" });
        r.result.createObjectStore("chunks");
      };
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
    });
    return this.database;
  }
  async progress(url: string): Promise<FileProgress | undefined> {
    const db = await this.open();
    return request(db.transaction("files").objectStore("files").get(url));
  }
  async append(file: FileProgress, bytes: Uint8Array) {
    const db = await this.open();
    const tx = db.transaction(["files", "chunks"], "readwrite");
    const done = complete(tx);
    tx.objectStore("chunks").put(bytes, [file.url, file.offset]);
    tx.objectStore("files").put({ ...file, offset: file.offset + bytes.length });
    await done;
  }
  async chunk(url: string, offset: number): Promise<Uint8Array | undefined> {
    const db = await this.open();
    return request(db.transaction("chunks").objectStore("chunks").get([url, offset]));
  }
  async clear(url: string) {
    const db = await this.open();
    const tx = db.transaction(["files", "chunks"], "readwrite");
    const done = complete(tx);
    tx.objectStore("files").delete(url);
    tx.objectStore("chunks").delete(IDBKeyRange.bound([url, 0], [url, Number.MAX_SAFE_INTEGER]));
    await done;
  }
  async response(
    url: string,
    size: number,
    ranges: { offset: number; length: number }[] = [{ offset: 0, length: size }],
  ): Promise<Response | undefined> {
    const saved = await this.progress(url);
    if (!saved || saved.size !== size || saved.offset !== size) return;
    for (const range of ranges) {
      if (
        !Number.isSafeInteger(range.offset) ||
        !Number.isSafeInteger(range.length) ||
        range.offset < 0 ||
        range.length < 0 ||
        range.offset + range.length > size
      )
        throw Error("Invalid model byte range.");
    }
    let index = 0;
    let consumed = 0;
    let chunkOffset = -1;
    let chunk: Uint8Array | undefined;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull: async (controller) => {
          try {
            while (index < ranges.length && consumed === ranges[index].length) {
              index++;
              consumed = 0;
            }
            if (index === ranges.length) return controller.close();
            const range = ranges[index];
            const position = range.offset + consumed;
            const base = Math.floor(position / DOWNLOAD_CHUNK_BYTES) * DOWNLOAD_CHUNK_BYTES;
            if (chunkOffset !== base) {
              chunk = await this.chunk(url, base);
              chunkOffset = base;
            }
            const start = position - base;
            const length = Math.min(range.length - consumed, (chunk?.length ?? 0) - start);
            if (!chunk || length <= 0) throw Error("Download chunks are incomplete.");
            controller.enqueue(chunk.slice(start, start + length));
            consumed += length;
          } catch (cause) {
            controller.error(cause);
          }
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(stream, {
      headers: { "content-length": String(ranges.reduce((n, r) => n + r.length, 0)) },
    });
  }
}

/** Immutable revision URLs prevent mixing chunks from different model versions. */
export async function downloadFile(
  file: { url: string; size: number },
  store: ModelDownloadStore,
  cache: Pick<Cache, "match">,
  signal: AbortSignal,
  fetcher: typeof fetch,
  onProgress: (offset: number) => void,
) {
  if (await cache.match(file.url)) return onProgress(file.size);
  let saved = await store.progress(file.url);
  if (saved && saved.size !== file.size) {
    await store.clear(file.url);
    saved = undefined;
  }
  let offset = saved?.offset ?? 0;
  onProgress(offset);
  signal.throwIfAborted();
  if (offset === file.size) return;
  await checkStorageSpace(file.size, offset);
  while (offset < file.size) {
    signal.throwIfAborted();
    const end = Math.min(offset + DOWNLOAD_CHUNK_BYTES, file.size) - 1;
    const response = await fetcher(file.url, {
      headers: { Range: `bytes=${offset}-${end}` },
      signal,
    });
    const wholeSmallFile =
      response.status === 200 && offset === 0 && file.size <= DOWNLOAD_CHUNK_BYTES;
    if (response.status !== 206 && !wholeSmallFile) {
      await response.body?.cancel();
      throw Error("下载服务器未提供分段响应，暂时无法断点续传。");
    }
    const expected = `bytes ${offset}-${end}/${file.size}`;
    if (!wholeSmallFile && response.headers.get("content-range") !== expected) {
      await response.body?.cancel();
      throw Error("下载文件范围或版本不匹配，请稍后重试。");
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error("下载响应为空。");
    const bytes = new Uint8Array(end - offset + 1);
    let received = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        if (received + item.value.length > bytes.length) throw Error("下载分块长度异常。");
        bytes.set(item.value, received);
        received += item.value.length;
        onProgress(offset + received);
      }
      signal.throwIfAborted();
      if (received !== bytes.length) throw Error("下载分块不完整，请重试。");
      await store.append({ ...file, offset }, bytes);
      offset += received;
      onProgress(offset);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  signal.throwIfAborted();
  // append commits the final chunk and progress atomically. Readers stream the chunks.
  onProgress(offset);
}
