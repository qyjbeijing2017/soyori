/** Prepare the pinned ONNX graph for ORT Web without changing tensor bytes. */
const MARKER = "x-agent-plan-external-data";
function varint(n: number): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  do {
    const b = n % 128;
    n = Math.floor(n / 128);
    bytes.push(b + (n ? 128 : 0));
  } while (n);
  return Uint8Array.from(bytes);
}
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}
function field(n: number, data: Uint8Array) {
  return concat([varint(n * 8 + 2), varint(data.length), data]);
}
function fields(b: Uint8Array) {
  let p = 0;
  function read() {
    let n = 0,
      multiplier = 1;
    for (let i = 0; i < 8; i++) {
      if (p >= b.length) throw Error("AI_MODEL_FORMAT: Truncated protobuf.");
      const x = b[p++];
      n += (x & 127) * multiplier;
      if (!Number.isSafeInteger(n)) throw Error("AI_MODEL_FORMAT: Invalid protobuf integer.");
      if (!(x & 128)) return n;
      multiplier *= 128;
    }
    throw Error("AI_MODEL_FORMAT: Invalid protobuf integer.");
  }
  const list: { n: number; start: number; end: number; from: number; to: number }[] = [];
  while (p < b.length) {
    const start = p,
      tag = read(),
      wire = tag & 7;
    let from = p;
    if (!tag) throw Error("AI_MODEL_FORMAT: Invalid protobuf field.");
    if (wire === 2) {
      const length = read();
      from = p;
      p += length;
    } else if (wire === 0) read();
    else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else throw Error("AI_MODEL_FORMAT: Unsupported protobuf field.");
    if (p > b.length) throw Error("AI_MODEL_FORMAT: Truncated protobuf field.");
    list.push({ n: Math.floor(tag / 8), start, end: p, from, to: p });
  }
  return list;
}
function indexExternalOnnx(original: ArrayBuffer, location: string) {
  const bytes = new Uint8Array(original),
    root = fields(bytes),
    graphField = root.find((f) => f.n === 7);
  if (!graphField) throw Error("AI_MODEL_FORMAT: Missing ONNX graph.");
  const graph = bytes.subarray(graphField.from, graphField.to);
  const parts: Uint8Array[] = [],
    ranges: { offset: number; length: number }[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  const entry = (key: string, value: string) =>
    field(13, concat([field(1, enc.encode(key)), field(2, enc.encode(value))]));
  for (const f of fields(graph)) {
    if (f.n !== 5) {
      parts.push(graph.subarray(f.start, f.end));
      continue;
    }
    const tensor = graph.subarray(f.from, f.to),
      tf = fields(tensor),
      raw = tf.find((t) => t.n === 9);
    if (!raw || raw.to - raw.from < 1024) {
      parts.push(graph.subarray(f.start, f.end));
      continue;
    }
    if (tf.some((t) => t.n === 13 || t.n === 14))
      throw Error("AI_MODEL_FORMAT: Already external tensor.");
    const length = raw.to - raw.from;
    ranges.push({ offset: graphField.from + f.from + raw.from, length });
    const small = tf.filter((t) => t.n !== 9).map((t) => tensor.subarray(t.start, t.end));
    small.push(
      entry("location", location),
      entry("offset", String(offset)),
      entry("length", String(length)),
      varint(14 * 8),
      varint(1),
    );
    parts.push(field(5, concat(small)));
    offset += length;
  }
  if (!offset) throw Error("AI_MODEL_FORMAT: Missing embedded weights.");
  const newGraph = field(7, concat(parts));
  return {
    graph: concat(root.map((f) => (f.n === 7 ? newGraph : bytes.subarray(f.start, f.end)))),
    ranges,
  };
}
export function externalizeOnnx(original: ArrayBuffer, location: string) {
  const { graph, ranges } = indexExternalOnnx(original, location);
  return {
    graph,
    weights: new Blob(ranges.map(({ offset, length }) => original.slice(offset, offset + length))),
  };
}

export interface BrowserModelFileCache {
  match(url: string): Promise<Response | undefined>;
  readRanges?(
    url: string,
    ranges: { offset: number; length: number }[],
  ): Promise<Response | undefined>;
}

/** Virtual external weights reference the original file; never persist a second copy. */
export async function prepareExternalWeights(
  cache: BrowserModelFileCache,
  url: string,
): Promise<BrowserModelFileCache> {
  const response = await cache.match(url);
  if (!response) return cache; // tokenizer-only downloads do not include a graph
  const dataURL = `${url}_data`;
  if (response.headers.get(MARKER) === "1") {
    if (!(await cache.match(dataURL)))
      throw Error(
        "AI_MODEL_CACHE: External weights are missing; clear the incomplete model cache and download again.",
      );
    return cache;
  }
  const location = new URL(dataURL).pathname.split("/").at(-1);
  if (!location) throw Error("AI_MODEL_FORMAT: Invalid model URL.");
  const original = await response.arrayBuffer();
  const { graph, ranges } = indexExternalOnnx(original, location);
  // Hosts with ranged storage only retain the small graph and offsets. The legacy
  // cache-name API uses a Blob in memory, without modifying its persistent cache.
  const fallback = cache.readRanges
    ? undefined
    : new Blob(ranges.map(({ offset, length }) => new Uint8Array(original, offset, length)));
  const readRanges = cache.readRanges?.bind(cache);
  return {
    async match(key) {
      if (key === url) return new Response(graph, { headers: { [MARKER]: "1" } });
      if (key === dataURL) {
        const weights = readRanges ? await readRanges(url, ranges) : new Response(fallback);
        if (!weights) throw Error("AI_MODEL_CACHE: Original model weights are missing.");
        return weights;
      }
      return cache.match(key);
    },
  };
}
