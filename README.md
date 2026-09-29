# agent-plan

本地 Agent 流程工具总仓库。core 和 CLI 都采用独立 Git 仓库，通过子模块固定版本，通过 pnpm workspace 联合开发。

```text
agent-plan/
├─ agent-plan-core/       # Git 子模块：独立运行内核
├─ agent-plan-cli/        # Git 子模块：独立命令行工具
├─ examples/              # 可运行流程与外部函数示例
├─ .gitmodules
├─ pnpm-workspace.yaml
└─ pnpm-lock.yaml
```

## 获取与安装

需要 Node.js 24 和 pnpm；包管理器版本固定在根 `package.json`。

```sh
git clone --recurse-submodules https://github.com/qyjbeijing2017/agent-plan.git
cd agent-plan
pnpm install --frozen-lockfile
pnpm build
pnpm test
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
pnpm cli run examples/parent.json --flows examples/add-one.json --input examples/input.json --json
pnpm cli run examples/function.json --functions examples/functions.mjs --json
```

前两个运行示例输出 `{ "count": 3 }`，外部函数示例输出 `{ "message": "Hello, Agent!" }`。

`--flows` 可重复指定多个子流程文件。`--functions` 指向默认导出函数注册表的本地 ESM 模块，宿主代码由 CLI 导入并执行。所有路径相对命令执行目录解析。

默认输出使用 Node inspector，可查看 `undefined`、二进制和循环对象；`--json` 要求结果可以无损表示为 JSON，否则报错。错误写到 stderr，退出码为 1。

当前 CLI 实现 `run`，交互式 `debug` 后续设计。包声明了 `agent-plan` 命令入口；目前标记为 private，尚未发布或全局安装。

## 包职责

- **core**：流程结构、校验、字段与节点、runtime、调用栈、外部函数执行机制。不依赖 CLI。
- **cli**：命令参数、文件加载、函数模块导入、输出与退出码。通过 `agent-plan-core: workspace:*` 使用本地子模块包，不复制 core 源码。

运行器能力与示例见 [core 文档](agent-plan-core/README.md)。

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
