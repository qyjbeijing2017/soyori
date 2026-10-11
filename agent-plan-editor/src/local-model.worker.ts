import type { GenerateInput } from "agent-plan-ai";
import { createLocalModel } from "agent-plan-ai/local";
import mjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import wasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { configureManagedModelCache } from "./model-files";

const local = createLocalModel({
  device: "webgpu",
  stream: (event) => self.postMessage({ type: "stream", event }),
  progress: (message) => self.postMessage({ type: "progress", message }),
});
self.onmessage = async (event: MessageEvent<GenerateInput | { type: "initialize" }>) => {
  try {
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
      }
    ).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter?.features.has("shader-f16"))
      throw new Error(
        "此浏览器或设备不支持本地模型所需的 WebGPU / shader-f16，请选择 API 模型或使用支持的设备。",
      );
    await configureManagedModelCache({ wasm, mjs });
    if ("type" in event.data && event.data.type === "initialize") {
      await local.initialize();
      self.postMessage({ type: "initialized" });
      return;
    }
    const result = await local.generate(event.data as GenerateInput);
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
