# Agent Plan Editor

React + TypeScript + Vite 的响应式 Web editor 基础工程，复用 `agent-plan-core` 的公开 API。

从总工作区执行：

```sh
pnpm install
pnpm editor
```

构建：`pnpm --filter agent-plan-core build` 后执行 `pnpm --filter agent-plan-editor build`。

当前提供 JSON 编辑、core 校验、单步运行和重置的接入示例；仅支持不需要外部 imports 或宿主函数的流程。页面内数据不持久化，不是最终步骤编辑器。当前没有浏览器版 runScript。

后续方向：步骤列表与嵌套块编辑；虚拟工程文件树与 IndexedDB 自动保存；ZIP 导入导出；能力检测后提供本地目录关联；GitHub/Gitee API 加个人令牌作为可选同步；内置助手共用 editor 操作接口，API 模型与可选浏览器本地模型共用模型适配层。

工程文件可以同步；运行现场不持久化恢复。PC Agent 直接使用 CLI 测试，浏览器工具在真实浏览器里测试。CSS 与 React 自身状态足够支撑初版，暂不引入组件库、全局状态库或模型 SDK。
