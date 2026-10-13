import { LOCAL_MODEL, LOCAL_REVISION } from "soyori-ai";
import { configureBrowserModelCache } from "soyori-ai/local";

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

/** Both the page tokenizer and model Worker read the same complete-file cache. */
export async function configureManagedModelCache(runtimePaths?: { wasm: string; mjs: string }) {
  await configureBrowserModelCache(MODEL_CACHE, runtimePaths);
}
