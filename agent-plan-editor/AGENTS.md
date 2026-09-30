# Editor 工作约定

先阅读根目录 AGENTS.md 和 docs/project-context.md。此包属于总 workspace，不是独立 Git 子模块。

- 复用 agent-plan-core 的公开 API，不复制流程语义。
- 保持手机可操作；使用语义化表单、清晰状态和至少 44px 的主要操作目标。
- 当前只是基础接入示例，README 明确未实现功能；不要把页面内草稿称为已保存。
- 工程文件持久化与运行现场分开，不增加会话恢复。
- 新功能按需引入依赖，不预建模型、存储与同步的空壳实现。
- 修改后运行 workspace 的 Biome 检查及 editor 类型检查、生产构建；行为改动按需验证。
