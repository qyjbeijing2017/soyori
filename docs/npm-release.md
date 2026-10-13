# npm 发布准备

打包范围为 core、storage、script、tools、ai、cli 六个包；初始版本 `0.1.0`，许可证 MIT。版本与 scope 统一配置在根 `package.json` 的 `soyoriRelease`。当前配置中的 `@soyori` 是 Soyori 的发布候选 scope，尚未确认拥有发布权限，也未发布。

> **发布状态：尚未发布。** 项目已更名 Soyori。此前 agent-plan 与 @agent-plan/core 名称冲突，未执行发布；当前候选 @soyori 需先确认账号或组织权限，不能将本地打包成功当作注册表已经可安装。

本地开发包名已统一为 soyori-*，依赖仍使用 `workspace:*`，工作区仍为 private。发布脚本从编译结果生成独立发布目录，将内部依赖转换成 npm alias，例如 `soyori-core: npm:@soyori/core@0.1.0`。安装后内部 import 可以继续解析，用户安装入口是 `@soyori/cli`。

## 1. 构建和打包

在完整工作区执行，需 Node 24、pnpm 和 npm：

```powershell
pnpm verify
pnpm release:pack
```

`release:pack` 构建 CLI 及其五个依赖包，不构建 Editor；只生成本地产物，不发布。每次使用新的 `output/npm/<version>-<timestamp>/` 目录，`output/npm/latest.json` 指向最新完整打包结果。

每个发布包仅包含 `dist/`、package.json、README 和 LICENSE；保留 CLI 主入口、运行 Worker、脚本 Worker 及共享包的公开 exports。去掉 private、开发依赖和开发脚本，配置 public npm registry。模型权重不打包，按需下载；第三方依赖及其许可证由 npm 一起安装。

如果脚本找不到 npm，可设置 `SOYORI_NPM_CLI` 为本机 `npm/bin/npm-cli.js` 的绝对路径。

## 2. 验证独立安装

```powershell
pnpm release:verify
```

脚本在系统临时目录新建独立项目，以临时本地注册表提供六个待发布的 tgz，第三方依赖从 npm 官方注册表安装。不会读取工作区 node_modules 来运行发布包，也不下载模型权重、不调用付费 API、不发布。

检查依赖解析、tgz integrity、npm 命令 shim、CLI 帮助、YAML 执行、脚本 Worker、模拟远程模型调用和共享包公开 exports。成功后在本次产物目录写 `verification.json`，记录 Node、平台及安装目录；保留临时安装目录供检查。重复验证会新建独立目录，运行开始与失败时标为 verified=false，避免沿用旧成功记录。

CI 在 Windows/Linux 上运行打包与独立安装检查。CI 配置存在不代表已经在远端通过；实际结果以运行记录为准。本地模型真实推理、macOS 运行及真实供应商账号需另外验证。

## 3. 正式发布

正式发布前，确定一个自己拥有权限的 npm 用户或组织 scope，将根 package.json 的 soyoriRelease.scope 改为该名称，核查六个包名，再重新执行 release:pack 和 release:verify。@soyori 产物仅供本地验证，确认 scope 权限并完成本次验证后才能发布。本准备流程不创建组织、不配置账号、不执行发布。

读取 `output/npm/latest.json`，进入其 `destination` 目录，确认该目录存在成功的 `verification.json`。先登录：

```powershell
npm login
npm whoami
```

按 npm 的登录与二次验证提示操作。使用 artifacts.json 中的真实 filename，依次以 core、storage、script、tools、ai、cli 顺序执行 `npm publish ./文件名.tgz --access public`。同一个包的同一版本不能重复发布。Git 提交与 npm 发布是不同操作，Git 仍按子仓库先提交/推送、总仓库后更新指针处理。

## 4. 发布后的用户入口

以下为示意，需将 YOUR_SCOPE 替换为最终 scope，且六个包正式发布后才可用：

```powershell
npm install -g @YOUR_SCOPE/cli
soyori --help
soyori run ./translate.yaml --json --timeout 10m
```

用户只需要 Node 24 和 npm，无需 pnpm、源码或子模块。当前快速入门仍保留源码安装方式，正式发布并验证注册表安装后再切换。域名、一键安装脚本和独立运行时发行包不属于本次范围。

参考：[npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[pnpm workspace aliases](https://pnpm.io/workspaces)。
