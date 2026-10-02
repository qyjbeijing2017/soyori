# Editor 工作约定

先阅读根目录 AGENTS.md 和 docs/project-context.md。此包属于总 workspace，不是独立 Git 子模块。

- 复用 agent-plan-core 的公开 API，不复制流程语义。
- 预设子流程负责简单，底层节点负责能力；默认展示必要输入，内部流程按需展开。AI 相关工作先读 [AI 工具与预设](../docs/ai-tools-and-presets.md)，不要把共享 AI 接入限定在 Editor 或把模型调用循环封死在节点里。
- 保持手机可操作；使用语义化表单、清晰状态和至少 44px 的主要操作目标。
- 当前已具备步骤编辑与运行工作台，README 明确未实现功能；不要把页面内草稿称为已保存。
- 工程文件持久化与运行现场分开，不增加会话恢复。
- 新功能按需引入依赖，不预建模型、存储与同步的空壳实现。
- 修改后运行 workspace 的 Biome 检查及 editor 类型检查、生产构建；行为改动按需验证。
