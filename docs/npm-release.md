# npm 打包与发布

发布六个无 scope 的公开包：`soyori-core`、`soyori-storage`、`soyori-script`、`soyori-tools`、`soyori-ai`、`soyori-cli`。初始版本 `0.1.0`，许可证 MIT。版本统一配置在根 `package.json` 的 `soyoriRelease.version`；包名沿用各包的 package.json，不添加个人或组织前缀。

> **发布状态：已发布。** 2026-10-14 六个 soyori-* 包的 0.1.0 已由 qiuyj 发布到 npm 公共注册表，latest 指向 0.1.0。注册表完整性与本地已验证产物一致；已在工作区外从官方注册表重新安装 soyori-cli@0.1.0，验证命令入口、YAML、字段映射、相对子流程、脚本 Worker 和公开 exports。对应发布源码提交为 `5ff959f`。

开发工作区仍为 private，内部依赖使用 `workspace:*`。发布脚本从编译结果生成独立发布目录，移除 private，并将内部依赖改为本次精确版本，例如 `soyori-core: 0.1.0`。开发和发布使用相同的包名，不再需要 npm alias。用户入口为 `npm install -g soyori-cli`，安装后执行 `soyori`。

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

正式发布前，用 `npm whoami` 确认当前账号，查询六个包的名称、版本及维护权限。首次发布需要包名可用；更新已有包需要当前账号有维护权限，并使用尚未发布的新版本。版本确定后重新执行 release:pack 和 release:verify。打包和安装验证命令不会自动发布。

读取 `output/npm/latest.json`，进入其 `destination` 目录，确认该目录存在成功的 `verification.json`。先登录：

```powershell
npm login
npm whoami
```

按 npm 的登录与二次验证提示操作。使用 artifacts.json 中的真实 filename，依次以 core、storage、script、tools、ai、cli 顺序执行 `npm publish ./文件名.tgz --access public`。同一个包的同一版本不能重复发布。全部源码由一个 Git 仓库管理：先验证、提交并推送对应源码，再发布同一批已验证产物，不再使用子仓库或子模块指针。

npm 要求发布者启用账号双重验证（2FA），或使用具备发布权限且开启 Bypass 2FA 的 granular token。仅 `npm login` 成功不代表可以发布；若收到对应 E403，应先完成账号验证，不修改包名或反复重打包。验证码、token 和恢复码仅在 npm 网站或本机终端输入，不写入仓库。

## 4. 发布后的用户入口

用户执行：

```powershell
npm install -g soyori-cli
soyori --help
soyori run ./translate.yaml --json --timeout 10m
```

用户只需要 Node 24 和 npm，无需 pnpm 或源码。CLI 快速入门与命令参考使用 npm 安装及 `soyori` 命令；仓库 README 另外保留源码开发方式。发布后需在新的临时目录从官方注册表安装 `soyori-cli@0.1.0`，检查帮助、YAML、脚本和子流程；并核对注册表 tarball integrity 与已验证产物一致。域名、一键安装脚本和独立运行时发行包不属于本次范围。

参考：[npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[npm 公开包](https://docs.npmjs.com/about-public-packages/)、[npm 发布验证要求](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)。
