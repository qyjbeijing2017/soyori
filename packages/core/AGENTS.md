# Core 的 AI 协作说明

Soyori 用于更方便地开发和逐步调试 AI Agent。工具开发与调试是重点，流程保持轻量；面向非程序用户的 editor 采用步骤编辑方向，不考虑画布。

- 本包属于 Soyori 单仓库，先读根 `../../AGENTS.md` 和 `../../docs/project-context.md`。复用根工作区与锁文件，不使用独立 Git 仓库或子模块。
- core 负责唯一的流程结构、校验和执行语义，不依赖 CLI、editor、文件系统或模型/网络 SDK。
- 当前输入采用 `$` 路径、JSON 固定值和 `$$` 转义。写入自动创建/覆盖中间结构；`append` 追加一项。保持 [数据方案](docs/operands.md) 的宽松语义及其安全、资源边界。
- 保持单步、忙碌保护、子流程调用栈、引用身份和根重置语义；实时状态不是快照。参阅 [Runtime](docs/runtime.md)。
- Web Editor 与 CLI 在总工作区复用本包公开 API；共享调试服务、MCP 及原生平台适配属于规划，不是本包已有能力。
- 修改前检查根仓库 Git 状态，保留其他工作；变更同步协议文档、公开类型、示例和行为测试。在根目录运行 `pnpm --filter soyori-core typecheck`、`pnpm --filter soyori-core test`；跨包变更运行 `pnpm verify`。
