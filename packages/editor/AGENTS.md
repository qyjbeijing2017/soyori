# Editor 工作约定

先阅读根目录 ../../AGENTS.md 和 ../../docs/project-context.md。此包位于 packages/editor，属于统一 Git 仓库与 pnpm workspace。

- 复用 soyori-core 的公开 API，不复制流程语义。
- 预设子流程负责简单，底层节点负责能力；默认展示必要输入，内部流程按需展开。AI 相关工作先读 [AI 工具与预设](../../docs/ai-tools-and-presets.md)，不要把共享 AI 接入限定在 Editor 或把模型调用循环封死在节点里。
- 保持手机可操作；使用语义化表单、清晰状态和至少 44px 的主要操作目标。
- 当前已具备步骤编辑与运行工作台，README 明确未实现功能；不要把页面内草稿称为已保存。
- 工程文件持久化与运行现场分开，不增加会话恢复。
- 新功能按需引入依赖，不预建模型、存储与同步的空壳实现。
- 修改后运行 workspace 的 Biome 检查及 editor 类型检查、生产构建；行为改动按需验证。

- 基础 UI 优先使用 Mantine 与 `src/theme.ts`，不要重复手写菜单/弹窗的焦点和键盘行为；业务 CSS 不覆盖库的通用控件样式。
- 新界面文案接入 `src/i18n.ts`，同步 `src/locales/zh-CN.json` 与 `en.json`；使用插值，用户流程内容与协议标识保持原文。语言切换不得重建运行会话。
