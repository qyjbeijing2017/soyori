# CLI 的 AI 协作说明

Soyori 用于更方便地开发和逐步调试 AI Agent，强调工具开发和用户与 AI 联调。CLI 是人和 AI 都能使用的进程入口；Web Editor 已使用步骤列表编辑并兼顾手机。

- 本包属于 Soyori 单仓库，先读根 `../../AGENTS.md` 和 `../../docs/project-context.md`；复用根工作区与锁文件，不使用独立 Git 仓库或子模块。
- CLI 负责参数、JSON/YAML/来源加载、宿主能力、机器输出、trace 和执行生命周期；流程校验与执行复用 `soyori-core` 公开 API，不复制语义。
- 步骤输入已使用 `$` 路径和直接常量；`--set`、运行输入对象仍使用原始字段名。不要把 CLI 参数赋值自行改成路径表达式。
- 保持版本化机器输出、stdout/stderr 隔离、错误定位、超时终止及资源清理。trace 是记录，不承诺恢复执行。
- 当前 `run/inspect/validate` 不是持久调试服务；共享调试会话、远程服务 API 和 MCP 属于规划。Web Editor 是总工作区的现有宿主，CLI 不提供其 Library 与内置助手界面。
- 先检查 Git 状态，保留已有改动。工作区依赖为 `workspace:*`，按 README 在总仓库开发；命令行为查看 `pnpm cli --help` 及子命令帮助。跨包变更运行根目录 `pnpm verify`，同步 CLI 文档、示例和集成测试。
