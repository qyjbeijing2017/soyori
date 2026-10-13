import { createLocalModel } from "soyori-ai/local";

/** Select once per CLI process; only initialization failures permit CPU fallback. */
export function createCliLocalModel(
  options: Omit<Parameters<typeof createLocalModel>[0], "device">,
  factory = createLocalModel,
) {
  let selected: ReturnType<typeof factory> | undefined;
  let initialization: Promise<ReturnType<typeof factory>> | undefined;

  async function initialize(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (selected) return selected;
    initialization ??= (async () => {
      const gpu = factory({ ...options, device: "webgpu" });
      options.progress?.("正在尝试 GPU 推理（WebGPU）。");
      try {
        await gpu.initialize();
        signal?.throwIfAborted();
        selected = gpu;
        options.progress?.("本地模型使用 GPU（WebGPU）。");
        return gpu;
      } catch {
        await gpu.dispose();
        signal?.throwIfAborted();
        options.progress?.("GPU 初始化失败，正在回退 CPU；可能需要下载 Q4 权重。");
      }
      const cpu = factory({ ...options, device: "cpu" });
      try {
        await cpu.initialize();
        signal?.throwIfAborted();
        selected = cpu;
        options.progress?.("本地模型使用 CPU。");
        return cpu;
      } catch (error) {
        await cpu.dispose();
        throw error;
      }
    })();
    try {
      return await initialization;
    } finally {
      initialization = undefined;
    }
  }

  return {
    async generate(...args: Parameters<ReturnType<typeof factory>["generate"]>) {
      const model = await initialize(args[1]);
      args[1]?.throwIfAborted();
      return model.generate(...args);
    },
  };
}
