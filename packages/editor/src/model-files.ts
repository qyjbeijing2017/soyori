import { LOCAL_MODEL, LOCAL_REVISION } from "soyori-ai";
import { configureBrowserModelCache } from "soyori-ai/local";
import { ModelDownloadStore } from "./model-download-store.ts";

export const MODEL_CACHE = "agent-plan-model-files-v1";
export const TOKENIZER_FILES = [
  { path: "config.json", size: 943 },
  { path: "tokenizer_config.json", size: 10360 },
  { path: "tokenizer.json", size: 9117040 },
  { path: "chat_template.jinja", size: 4116 },
];
export const MODEL_FILES = [
  ...TOKENIZER_FILES,
  { path: "generation_config.json", size: 219 },
  { path: "onnx/model_q4f16.onnx", size: 1426069098 },
];
export function modelFileURL(path: string) {
  return `https://huggingface.co/${LOCAL_MODEL}/resolve/${LOCAL_REVISION}/${path}`;
}

/** The page and Worker share persisted chunks, with existing Cache API files as fallback. */
export async function openManagedModelCache() {
  const legacy = await caches.open(MODEL_CACHE);
  const store = new ModelDownloadStore();
  return {
    async match(url: string) {
      const file = MODEL_FILES.find((file) => modelFileURL(file.path) === url);
      return (file && (await store.response(url, file.size))) || (await legacy.match(url));
    },
    async readRanges(url: string, ranges: { offset: number; length: number }[]) {
      const file = MODEL_FILES.find((file) => modelFileURL(file.path) === url);
      const response = file && (await store.response(url, file.size, ranges));
      if (response) return response;
      const cached = await legacy.match(url);
      if (!cached) return;
      const blob = await cached.blob();
      return new Response(
        new Blob(ranges.map(({ offset, length }) => blob.slice(offset, offset + length))),
      );
    },
  };
}

export async function configureManagedModelCache(runtimePaths?: { wasm: string; mjs: string }) {
  await configureBrowserModelCache(await openManagedModelCache(), runtimePaths);
}
