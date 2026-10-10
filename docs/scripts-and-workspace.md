# 脚本与浏览器文件工作区

Library 是存储在 IndexedDB 的浏览器内工作区，不直接同步电脑目录。文件以路径、稳定 ID、类型、更新时间和原始 Blob 保存，空目录单独保存。上传文件夹保留相对路径；任意类型文件均可保存、下载，ZIP 导入导出保留目录和原始字节。同路径冲突拒绝整批导入，不静默覆盖。文件/目录可改名或移动，引用路径需同步手动调整。

JSON、YAML、YML 经文件解析和 Core `parseFlow` 校验后才进入流程列表、调用选择器和对话选择器。普通配置和无效流程仍保留为文件，可查看校验信息、编辑文本。可识别流程默认进入表单编辑器，也可使用「源码」编辑；表单保存会重新序列化流程。旧 Library 记录保留备份，迁移时保留文件 ID 以延续对话记录。新流程引用保存成相对文件路径；ZIP 解压后可用 CLI 运行。

## 文件库操作与代码编辑

文件库保留 SVAR File Manager 原生目录树、搜索、排序、列表/卡片/双栏视图、预览和新建/上传菜单。原生新建、改名、复制、剪切/粘贴、删除接入 IndexedDB；复制分配新文件 ID，移动保留 ID。复制遇到重名时自动生成 `名称 (2)`、`名称 (3)`，文件扩展名保留，整组目录内容一起改到副本路径；不覆盖已有内容。移动遇到重名仍整批拒绝并报告目标路径，剪切粘贴回原目录保持原状。桌面文件夹双击进入；手机窄屏或触摸操作时轻点文件夹进入、轻点返回父文件夹回到上级，目录操作菜单仍保持独立。文件双击打开流程表单或源码编辑器。文件菜单保留下载，目录菜单补充下载；新建菜单额外提供新建流程、导入文件夹及下载当前目录。

上传文件时，仅文件名以 `.agentp.zip` 结尾（不区分大小写）的工程包自动解包到上传目标目录；普通 `.zip` 原样存储，即使不是有效 ZIP 也不解压。整个文件夹导入保留内部文件原貌。目录与工作区导出为 `名称.agentp.zip`；目录包保留所选目录为归档根，不包含同层其他内容。工程包解包仍校验路径、冲突和解压后体积/数量限制。

组件自带小屏布局（宽度低于 768px 收起目录树，侧栏按钮展开；预览使用窄屏布局）。保持原生交互，未另造移动文件管理界面。

`script.run.code` 与文件源码共用 CodeMirror 编辑器，提供行号、JavaScript/JSON/YAML 高亮、缩进/括号补齐、全屏编辑。JavaScript 提供语法诊断、`input`/`result` 提示及工作区相对导入路径补全；这些编辑辅助不改变运行器支持范围，不是 TypeScript 类型检查。全屏编辑修改同一份草稿，文件仍需点击保存。

## script.run

CLI 和 Editor 注册同名 `script.run` 工具，旧调用名 `runScript` 已移除。仅接受必填 `code`（ES 模块源码）和可选 `input`（JSON，省略为 `{}`）。模块顶层直接读取全局 `input`，调用全局 `result(value)` 设置节点输出。`result` 不退出执行，按调用时的 JSON 快照保存，多次调用以最后一次为准；未调用则返回 `null`。模块求值和顶层 await 完成后返回，不等待未被 await 的后台任务。后续异常会使整个调用失败，即使此前设置过结果。导出函数不会自动调用；需要时显式调用。旧 `script` 参数已移除，不兼容旧接口。使用步骤 `output` 保存结果。Core 不负责文件加载或脚本执行。
```yaml
type: call
target: script.run
inputs:
  code: |
    import { prefix } from './lib/prefix.js';
    const { suffix } = await import('./lib/suffix.js');
    result(prefix + input.text + suffix);
  input:
    text: $chatIn
output: $chatOut
```

仅引用外部脚本时可以写 `code: "import './scripts/main.js';"`，该文件的顶层代码会执行，并可使用同一组全局 `input` 和 `result`。已有默认导出函数的文件可显式调用：

```js
import main from './scripts/main.js';
result(await main(input));
```

静态 `import`、再导出和字符串字面量 `await import("./module.js")` 均支持。相对导入基于当前脚本，内联代码基于调用流程；远程模块基于重定向后的最终 URL。JSON 模块也支持。计算式 `import(variable)` 和用户脚本中的 `require` 暂不支持。

共享包 `agent-plan-script` 使用 Acorn 校验和 esbuild 模块打包，处理循环依赖和同一来源的模块复用。执行前加载并打包静态及字面量动态依赖，动态模块的求值仍在调用时发生；因此尚未走到的动态导入路径缺失也会在准备阶段报错。`import.meta.url` 保留原始来源。

CLI 使用原生打包器，允许本地脚本引用已安装的 npm 包与 Node 内置模块，不自动安装包；浏览器使用 WASM 打包器和工作区快照，包名导入、Node 内置模块不适用。两端 HTTPS 模块不得转向本地文件；浏览器网络模块还受 CORS 约束。保存任意文件不代表它们都可作为 JavaScript 模块执行，TS 等文件目前只可保存/编辑。

每次脚本调用创建独立 Worker，结束或失败后终止，参数按 JSON 复制。CLI 沿用全流程超时；Editor 每次脚本调用包含编译、加载和执行共 30 秒，取消时终止 Worker。Worker 不是不可信代码安全沙箱。用户模块单个上限 2 MiB、依赖图最多 128 个模块和 16 MiB；浏览器单次文件/ZIP 导入上限 100 MiB，ZIP 解压内容最多 100 MiB、5000 条。

示例目录：[script-workspace](../examples/script-workspace/flow.yaml)。导入整个目录，或将其打包成 ZIP 后导入，打开 `flow.yaml` 即可测试；CLI 使用 `pnpm cli run examples/script-workspace/flow.yaml --json`。

新建流程以流程名称生成 `.yaml` 文件名，保留名称中的点号，并存入当前目录；路径分隔符等不适合文件名的字符替换为下划线。同名路径报错而不覆盖已有文件。已保存流程修改名称时保留文件路径，避免改变既有相对导入引用；文件改名通过文件库操作。
