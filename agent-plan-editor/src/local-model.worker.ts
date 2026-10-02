import type { GenerateInput } from "agent-plan-ai";
import { createLocalModel } from "agent-plan-ai/local";

const local = createLocalModel({
  device: "webgpu",
  progress: (message) => self.postMessage({ type: "progress", message }),
});
self.onmessage = async (event: MessageEvent<GenerateInput>) => {
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
    const result = await local.generate(event.data);
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
