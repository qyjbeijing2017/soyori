# Agent Plan Editor

React + TypeScript + Vite 的响应式 Web editor 基础工程，复用 `agent-plan-core` 的公开 API。

从总工作区执行：

```sh
pnpm install
pnpm editor
```

构建：先构建 `agent-plan-core` 和 `agent-plan-ai`，再执行 `pnpm --filter agent-plan-editor build`；也可在根目录 `pnpm build`。

默认直接打开可运行的欢迎语示例。已支持：

- 步骤卡片与表单编辑，新增、复制、删除、上移下移，以及一次修改撤销。
- 常量文字、数据引用与 JSON 值输入；If/While 嵌套步骤编辑。
- 单步、连续运行、步骤间暂停、继续与重置。每次连续运行最多推进 2000 步后暂停。
- 按执行路径显示状态、错误建议、原始错误与执行前后数据。最近 300 条记录保存为展示文本，后续变量变动不会污染它们；不是可恢复快照。
- 流程名称、字段定义与完整结构可在折叠的源码设置中校验并应用。
- 手机单列布局和固定运行栏，完成或报错后移动到结果区。

页面内草稿不持久化，刷新即重置。修改步骤或输入会清空旧运行；步骤编辑保留本次输入，字段定义改变则重建输入表单。普通输入中的 `$` 保持字面量；步骤表单的文字模式自动转义 `$`，引用模式按 core 路径规则执行。

`storage.read/write/delete/list` 与 `tokens.count` 已注册，可在高级调用 JSON 中使用。存储使用当前站点 IndexedDB，刷新后保留；不代表工程草稿已保存。计数支持本地 tokenizer 与无网络估算。详见 [存储与计数](../docs/storage-and-tokens.md)。

现已注册 `local.generate`、`openai.generate`、`anthropic.generate`。点击“添加 AI 调用”后配置步骤；凭据和本地下载许可在“AI 设置”。本地推理运行于 WebGPU Worker，可查看下载进度、取消、释放模型；密钥只在当前页面内存中保存。详见 [AI 工具说明](../agent-plan-ai/README.md)。其他宿主工具、外部 imports 和浏览器版 runScript 仍未接入；步骤记录不代表工具内部单步。

验证：`pnpm --filter agent-plan-editor test`、`pnpm --filter agent-plan-editor build`。测试覆盖单步结果、嵌套错误与修正重跑、对象变更记录隔离和历史上限。

后续方向：虚拟工程文件树与 IndexedDB 自动保存；ZIP 导入导出；能力检测后提供本地目录关联；GitHub/Gitee API 加个人令牌作为可选同步。AI 部分先提供免费本地模型候选与 OpenAI、Anthropic 独立工具，优先复用 LangChain 集成，并与 CLI 共享适用能力；暂不做内置助手。

产品原则是“预设子流程负责简单，底层节点负责能力”：新手使用任务预设，按需展开内部流程；供应商切换和 Agent 工具循环使用可编辑子流程组合。详细边界及未实现事项见 [AI 工具与预设](../docs/ai-tools-and-presets.md)。

工程文件可以同步；运行现场不持久化恢复。PC Agent 直接使用 CLI 测试，浏览器工具在真实浏览器里测试。CSS 与 React 自身状态足够支撑初版，暂不引入组件库或全局状态库；模型库按需动态加载。
