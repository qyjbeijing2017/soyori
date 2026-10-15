# Soyori

[English](README.md) | **简体中文**

[v0.1.0 — 首个上线版本](docs/releases/v0.1.0.zh-CN.md)

**[官网 / 在线编辑器](https://soyori.joycows.com)** · **[在线手册](https://soyori.joycows.com/#document/introduction)**

Soyori 的统一源码仓库。七个包位于 packages/*，通过 pnpm workspace 联合开发；Core 和 CLI 是普通包目录，不再使用 Git 子模块。

Soyori 面向人与 AI 共同开发、运行和调试行为计划，长期为类似人的数字生命建立基础。当前工作聚焦可理解、可编辑、可验证的 Plan 系统。

使用产品请从[正式手册完整目录](docs/handbook/README.zh-CN.md)和[快速入门](docs/handbook/quick-start.md)开始，也可阅读[英文手册](docs/handbook/README.md)。手册可在 GitHub 直接浏览，包含截图、完整示例文件与预期结果；网页侧栏 Document 与助手读取同一套正文。CLI 用法见[命令参考](docs/handbook/cli/guide.md)。

| 从这里开始 | 教程 |
| --- | --- |
| 了解 Soyori | [产品简介](docs/handbook/introduction.md) |
| 创建第一个流程 | [电脑端 Editor](docs/handbook/quick-start.md) · [手机端 Editor](docs/handbook/quick-start-mobile.md) · [YAML + CLI](docs/handbook/quick-start-cli.md) |
| 记住对话内容 | [快速入门 2：使用记忆](docs/handbook/quick-start-memory.md) |
| 让助手使用工具 | [快速入门 3：使用工具](docs/handbook/quick-start-tools.md) |

项目目标是让用户和 AI 更方便地开发、运行和逐步调试 AI Agent，重点放在工具能力与联调，流程保持轻量。新加入的开发者或 AI 窗口先读 [项目目标与决策](docs/project-context.md)；自动协作入口见 [AGENTS.md](AGENTS.md)。文档明确区分已实现能力、用户确认方向和后续方案建议。

核心产品原则：**预设子流程负责简单，底层节点负责能力**。当前能力与后续方向见 [AI 工具与预设](docs/ai-tools-and-presets.md)。共享模型工具包含 llm.auto 和三种供应商调用，流程工具桥接、显式 Agent 循环及默认记忆模板已接入。Editor 内置助手可查询文档、管理文件、创建和运行流程；预设展示与升级机制仍待设计。

CLI/Editor 已接入通用 JSON 存储与 token 计数，见 [存储与计数](docs/storage-and-tokens.md)。记忆和压缩由流程组合；不自动保存运行现场。

```text
soyori/
├─ packages/
│  ├─ core/              # 唯一流程运行内核
│  ├─ cli/               # 命令行宿主
│  ├─ editor/            # Web 编辑与调试工作台
│  ├─ ai/                # 共享模型与消息工具
│  ├─ storage/           # 存储与运行环境
│  ├─ script/            # 脚本协议与模块准备
│  └─ tools/             # 共享基础工具
├─ docs/
├─ examples/
├─ scripts/
├─ pnpm-workspace.yaml
└─ pnpm-lock.yaml
```

## 获取与安装

CLI 使用 [Node.js 24 或更新版本](https://nodejs.org/)，安装后可在流程文件所在目录执行：

```sh
npm install -g soyori-cli
soyori --help
soyori run ./translate.yaml --json --timeout 10m
```

不需要 pnpm 或项目源码。`translate.yaml` 按 [YAML + CLI 入门](docs/handbook/quick-start-cli.md)创建；模型文件按需下载，不包含在 npm 包中。发布包统一使用 soyori-* 名称，许可证 MIT；发布记录与验证方法见 [npm 打包与发布](docs/npm-release.md)。

已发布的 `0.1.0` 尚未使用当前 `memory` 工具接口。新版记忆与 Agent 工具循环教程已说明如何使用源码构建版 CLI，等待后续 npm 版本。

## 源码开发安装

需要 Node.js 24 和 pnpm；包管理器版本固定在根 `package.json`。

```sh
git clone https://github.com/qyjbeijing2017/soyori.git
cd soyori
pnpm install --frozen-lockfile
pnpm build
pnpm verify
```

启动本地网页编辑器，打开 Vite 输出的本地地址：

```sh
pnpm editor
```

所有包共用根 pnpm-lock.yaml。只检查某个包时，可在根目录使用 `pnpm --filter soyori-core typecheck` 或对应包名；无需单独克隆 Core/CLI。

## 本地 CLI

在总仓库根目录执行：

```sh
pnpm cli --help
pnpm cli run examples/add-one.json --input examples/input.json --json
pnpm cli run examples/parent.json --input examples/input.json --json
pnpm cli run examples/function.json --functions examples/functions.mjs --json
pnpm cli run examples/add-one.yaml --input-json '{"count":2}' --json
pnpm cli run examples/add-one.yaml --set count=2 --json
pnpm cli run examples/parent.yaml --json
pnpm cli run examples/add-one.json --input-json '{"count":2}' --json
pnpm cli inspect examples/parent.json --json
pnpm cli validate examples/parent.json --json
pnpm cli run examples/parent.json --trace trace.jsonl --timeout 30s --json
pnpm cli run examples/object-values.json --json
```

前两个运行示例的 `result` 为 `{ "count": 3 }`，外部函数示例的 `result` 为 `{ "message": "Hello, Agent!" }`。JSON 输出统一为 `{ "version": 1, "ok": true, "result": ... }`，失败时为 `{ "version": 1, "ok": false, "error": ... }`。

流程内 `imports` 自动加载子流程，路径相对于所在流程文件；远程流程相对于重定向后的最终 URL。也可用 `--flows 别名=来源` 添加根流程引用。`--functions` 为相对于命令目录的本地 ESM 模块。详见 [引用与分发规则](packages/core/docs/distribution.md)。

流程支持 `.json`、`.yaml`、`.yml`，主流程和子流程可以混用，分发时保留原格式即可。CLI 解析后统一交给 core 校验；输入参数仍为 JSON，输出协议不变。YAML 写法见 [加一示例](examples/add-one.yaml)，格式细节见 [CLI 文档](packages/cli/README.md)。

人工测试可直接使用 `--set count=2`，多个参数重复传入，强制文本使用 `--set-string count=2`，不再需要转义 JSON。流程、字段和每一步都支持可选 `description`；通过 `inspect` 查看说明，trace 中也会记录步骤说明。

默认输出使用 Node inspector，可查看 `undefined`、二进制和循环对象；`--json` 要求结果是 JSON 数据，否则报错。JSON 模式的错误也输出到 stdout；文本模式错误写到 stderr。宿主日志始终转到 stderr。普通失败退出码为 1，超时 124，中断 130。

CLI 已实现 `run`、`inspect`、`validate`、文件/内联 JSON/stdin 输入、trace 和进程隔离超时。完整协议与边界见 [CLI 文档](packages/cli/README.md)。开发工作区保留 private，发布脚本生成同名可安装包，`soyori-cli` 提供 `soyori` 命令。

## 包职责

- **core**：流程结构、校验、字段与节点、runtime、调用栈、外部函数执行机制。不依赖 CLI。
- **cli**：命令参数、文件加载、函数模块导入、输出与退出码。通过 `soyori-core: workspace:*` 使用同仓库的 Core 包，不复制 core 源码。
- **ai**：共享模型调用、本地模型及 token 计数。
- **storage**：通用存储、用户配置与运行环境。
- **script**：共享 JavaScript 脚本模块契约和 Worker 执行。
- **tools**：共享基础工具及宿主工具注册。
- **editor**：浏览器文件库、步骤编辑、Agent 对话、内置助手和手册。

运行器能力与示例见 [core 文档](packages/core/README.md)。步骤输入现在支持 `$` 变量路径、JSON 固定值和 `append` 数组追加；详细规则见 [变量、对象与数组方案](packages/core/docs/operands.md)。本次直接调整未投入实际使用的格式，`schemaVersion` 保持 `1`，不自动兼容旧裸字段名。

## 仓库与提交

所有源码、文档及跨包修改由同一个 Git 仓库管理，不需要更新子模块指针。依赖变动统一更新根 pnpm-lock.yaml；提交时排除 node_modules、dist、output/、临时文件与凭证。独立 npm 包的发布顺序仍由依赖关系决定，参阅 [npm 发布准备](docs/npm-release.md)。

旧 agent-plan-core / agent-plan-cli 仓库保留作为迁移前历史来源，不再作为当前源码依赖。

## 工程检查

`pnpm verify` 运行 Biome、类型检查及所有测试；`pnpm format` 统一格式。Biome 对流程协议的 `then` 属性和测试中的故意稀疏数组做例外配置，其他使用推荐检查。

GitHub Actions 在 Windows 和 Linux 上检出同一主仓库，执行安装、pnpm verify、打包及工作区外安装验证；不再依赖 Core/CLI 子模块或专用读取密钥。

开发说明：[助手与浏览器运行](docs/editor-assistant.md)、[基础工具](docs/basic-tools.md)、[记忆工具](docs/memory-tools.md)、[模型工具调用](docs/tool-calling.md)。

GitHub 手册的中英文完整目录由现有语言目录生成。修改目录后执行 `node scripts/handbook-index.mjs`，使用 `node scripts/handbook-index.mjs --check` 检查是否同步。根目录两个 README 的内容也需一起维护。

## 联系与反馈

Bug 请通过 [GitHub Issues](https://github.com/qyjbeijing2017/soyori/issues) 提交，建议附上复现步骤、预期与实际结果、浏览器版本和脱敏截图。

作者：Jacson。其他联系请发邮件至 [qyjbeijing@gmail.com](mailto:qyjbeijing@gmail.com)。
