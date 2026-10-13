# agent-plan

本地 Agent 流程工具总仓库。core 和 CLI 都采用独立 Git 仓库，通过子模块固定版本，通过 pnpm workspace 联合开发。

使用产品请从[正式手册](docs/handbook/introduction.md)和[快速入门](docs/handbook/quick-start.md)开始。网页侧栏 Document 与助手读取同一套手册，CLI 用法见[命令参考](docs/handbook/cli/guide.md)。

项目目标是让用户和 AI 更方便地开发、运行和逐步调试 AI Agent，重点放在工具能力与联调，流程保持轻量。新加入的开发者或 AI 窗口先读 [项目目标与决策](docs/project-context.md)；自动协作入口见 [AGENTS.md](AGENTS.md)。文档明确区分已实现能力、用户确认方向和后续方案建议。

核心产品原则：**预设子流程负责简单，底层节点负责能力**。当前能力与后续方向见 [AI 工具与预设](docs/ai-tools-and-presets.md)。共享模型工具包含 llm.auto 和三种供应商调用，流程工具桥接、显式 Agent 循环及默认记忆模板已接入。Editor 内置助手可查询文档、管理文件、创建和运行流程；预设展示与升级机制仍待设计。

CLI/Editor 已接入通用 JSON 存储与 token 计数，见 [存储与计数](docs/storage-and-tokens.md)。记忆和压缩由流程组合；不自动保存运行现场。

```text
agent-plan/
├─ agent-plan-core/       # Git 子模块：独立运行内核
├─ agent-plan-cli/        # Git 子模块：独立命令行工具
├─ agent-plan-ai/         # Editor/CLI 共用的模型调用工具
├─ agent-plan-editor/     # Web 编辑与运行工作台
├─ examples/              # 可运行流程与外部函数示例
├─ .gitmodules
├─ pnpm-workspace.yaml
└─ pnpm-lock.yaml
```

## 获取与安装

npm 打包与工作区外安装验证已准备，许可证为 MIT。原计划的 `agent-plan` 和 `@agent-plan/core` 已被其他项目使用，发布 scope 待重新确定，本项目尚未发布到 npm。打包、名称核查和发布前提见 [npm 发布准备](docs/npm-release.md)；目前按下面的源码方式安装。

需要 Node.js 24 和 pnpm；包管理器版本固定在根 `package.json`。

```sh
git clone --recurse-submodules https://github.com/qyjbeijing2017/agent-plan.git
cd agent-plan
pnpm install --frozen-lockfile
pnpm build
pnpm verify
```

如果克隆时没有初始化子模块：

```sh
git submodule update --init --recursive
```

只需要 core 的人可以单独克隆 [agent-plan-core](https://github.com/qyjbeijing2017/agent-plan-core)，使用其自己的依赖锁文件、构建与测试。总仓库安装时使用根锁文件；子模块内的锁文件保留给独立开发使用。

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

流程内 `imports` 自动加载子流程，路径相对于所在流程文件；远程流程相对于重定向后的最终 URL。也可用 `--flows 别名=来源` 添加根流程引用。`--functions` 为相对于命令目录的本地 ESM 模块。详见 [引用与分发规则](agent-plan-core/docs/distribution.md)。

流程支持 `.json`、`.yaml`、`.yml`，主流程和子流程可以混用，分发时保留原格式即可。CLI 解析后统一交给 core 校验；输入参数仍为 JSON，输出协议不变。YAML 写法见 [加一示例](examples/add-one.yaml)，格式细节见 [CLI 文档](agent-plan-cli/README.md)。

人工测试可直接使用 `--set count=2`，多个参数重复传入，强制文本使用 `--set-string count=2`，不再需要转义 JSON。流程、字段和每一步都支持可选 `description`；通过 `inspect` 查看说明，trace 中也会记录步骤说明。

默认输出使用 Node inspector，可查看 `undefined`、二进制和循环对象；`--json` 要求结果是 JSON 数据，否则报错。JSON 模式的错误也输出到 stdout；文本模式错误写到 stderr。宿主日志始终转到 stderr。普通失败退出码为 1，超时 124，中断 130。

CLI 已实现 `run`、`inspect`、`validate`、文件/内联 JSON/stdin 输入、trace 和进程隔离超时。完整协议与边界见 [CLI 文档](agent-plan-cli/README.md)。包声明了 `agent-plan` 命令入口；目前标记为 private，尚未发布或全局安装。

## 包职责

- **core**：流程结构、校验、字段与节点、runtime、调用栈、外部函数执行机制。不依赖 CLI。
- **cli**：命令参数、文件加载、函数模块导入、输出与退出码。通过 `agent-plan-core: workspace:*` 使用本地子模块包，不复制 core 源码。
- **ai**：共享模型调用、本地模型及 token 计数。
- **storage**：通用存储、用户配置与运行环境。
- **script**：共享 JavaScript 脚本模块契约和 Worker 执行。
- **tools**：共享基础工具及宿主工具注册。
- **editor**：浏览器文件库、步骤编辑、Agent 对话、内置助手和手册。

运行器能力与示例见 [core 文档](agent-plan-core/README.md)。步骤输入现在支持 `$` 变量路径、JSON 固定值和 `append` 数组追加；详细规则见 [变量、对象与数组方案](agent-plan-core/docs/operands.md)。本次直接调整未投入实际使用的格式，`schemaVersion` 保持 `1`，不自动兼容旧裸字段名。

## 修改与提交子模块

总仓库固定 core 和 CLI 各自的某个提交，不自动跟随其最新版本。正常拉取后，子模块可能处于 detached HEAD；开始修改前按需要切换已有分支或创建开发分支。已有未提交改动时先处理好再切换。

core 改动完成后，先在子仓库提交并推送，再更新总仓库指针：

```sh
git -C agent-plan-core add <修改的文件>
git -C agent-plan-core commit -m "feat: update core"
git -C agent-plan-core push origin HEAD:<分支名>
git add agent-plan-core
git commit -m "chore: update core submodule"
git push
```

更新总仓库后同步固定的子模块版本：

```sh
git pull
git submodule update --init --recursive
```

CLI 同样先在 [agent-plan-cli](https://github.com/qyjbeijing2017/agent-plan-cli) 子仓库提交并推送，再提交总仓库指针（将上述命令中的 `agent-plan-core` 替换为 `agent-plan-cli`）。CLI 当前依赖 `workspace:*`，单独克隆后不能直接安装运行，请使用总工作区开发，详见 [CLI 文档](agent-plan-cli/README.md)。

若更改依赖，同时更新根 workspace 锁文件；core 独立依赖变动还需维护子仓库锁文件。不要将 `node_modules` 或 `dist` 提交。

## 工程检查

`pnpm verify` 运行 Biome、类型检查及所有测试；`pnpm format` 统一格式。Biome 对流程协议的 `then` 属性和测试中的故意稀疏数组做例外配置，其他使用推荐检查。

GitHub Actions 在 Windows 和 Linux 上验证总仓库固定的两个子模块提交。私有子仓库分别需要只读部署密钥，其私钥存储为总仓库 Actions secrets `CORE_READ_KEY` 和 `CLI_READ_KEY`；不需要个人访问令牌或子仓库写权限。来自不提供 secrets 的 fork PR 无法检出私有子模块。

开发说明：[助手与浏览器运行](docs/editor-assistant.md)、[基础工具](docs/basic-tools.md)、[记忆工具](docs/memory-tools.md)、[模型工具调用](docs/tool-calling.md)。
