# soyori-cli

通用 JSON 存储、配置管理和 token 计数见工作区 [存储与计数](../../docs/storage-and-tokens.md)。`storage info/list/get/delete` 管理用户数据，`config set storage-dir <目录>` 保存默认位置；流程工具为 `storage.read/write/delete/list` 和 `tokens.count`。本包依赖工作区 `soyori-storage`、`soyori-ai`。

Agent 流程的本地命令行工具，位于统一仓库的 packages/cli。

npm 发布准备已支持独立打包和安装验证。本目录的开发包仍为 private；项目已更名 Soyori，发布候选 scope 为 @soyori，权限尚待确认；总工作区通过 `pnpm release:pack` 生成产物、`pnpm release:verify` 验证安装；流程见 [npm 发布准备](../../docs/npm-release.md)，目前仍按源码方式安装。

内置单次 AI 调用：`llm.auto`、`llm.openai`、`llm.anthropic`、`llm.local`。llm.auto 按应用环境 LLM_PROVIDER 选择供应商；默认为 auto，依次选择完整 OpenAI 配置、Anthropic 配置，否则本地，失败不换供应商重试。通过共享的 `soyori-ai: workspace:*` 包提供；依赖总工作区，先在总仓库 `pnpm build`。完整参数与示例见 [AI 工具说明](../ai/README.md)。远程 apiKey、baseURL、model 由每个调用步骤的 inputs 提供，可引用流程运行输入；省略参数时自动读取应用环境 OPENAI_MODEL/API_KEY/BASE_URL 或 ANTHROPIC_MODEL/API_KEY/BASE_URL；连接环境按 --env > OS 环境 > env set 全局配置选择，不根据 threadId 切换。本地无需密钥，优先 Node WebGPU + Q4F16；GPU 初始化失败释放后回退 CPU + Q4。设备选择与回退提示写 stderr，同一进程复用选择结果；生成失败不切换重试。首次下载需增加超时，例如从总工作区运行 `pnpm cli run examples/ai-local.json --json --timeout 10m`。

## 开发

需要 Node.js 24 和 pnpm。当前 core 尚未发布到 npm，CLI 使用 `soyori-core: workspace:*`，因此请通过总仓库获取完整开发环境；只克隆 CLI 后直接安装依赖暂不支持。

```sh
git clone https://github.com/qyjbeijing2017/soyori.git
cd soyori
pnpm install --frozen-lockfile
pnpm build
pnpm --filter soyori-cli test
```

CLI 和 Core 位于同一仓库的 packages/cli、packages/core，依赖统一使用根 `pnpm-lock.yaml`。跨包修改、文档与验证在同一个提交中管理，无需更新子模块指针。总工作区使用 `pnpm verify` 检查格式、lint、类型及测试。

## 使用

构建后在 CLI 目录执行：

```sh
node dist/index.js --help
node dist/index.js run examples/add-one.json --input examples/input.json --json
node dist/index.js run examples/parent.json --input examples/input.json --json
node dist/index.js run examples/function.json --functions examples/functions.mjs --json
node dist/index.js run examples/add-one.json --input-json '{"count":2}' --json
node dist/index.js run examples/add-one.yaml --input-json '{"count":2}' --json
node dist/index.js run examples/add-one.yaml --set count=2 --json
node dist/index.js run examples/parent.yaml --json
node dist/index.js inspect examples/parent.json --json
node dist/index.js validate examples/parent.json --json
node dist/index.js run examples/parent.json --trace trace.jsonl --trace-values --timeout 30s --json
```

流程内 `imports` 自动加载子流程；`--flows 别名=来源` 可重复添加根流程引用，不允许覆盖同名 imports，也不会给子流程注册全局别名。引用路径相对于导入方文件或最终 URL。`--functions` 指定默认导出函数注册表的本地 ESM 模块，该路径相对命令目录。

```yaml
imports:
  increment: ./add-one.yaml
# 对应调用节点：target: increment
```

入口和 imports 均支持本地路径及 HTTP(S) URL。远程文件的相对引用基于重定向后的最终 URL，远程流程和重定向禁止访问本地文件。run/validate 预先加载全部依赖，inspect 只读取指定文档。单份文档最多 2 MiB、图最多 256 份文档；每次网络下载含重定向及正文最多 10 秒、最多 5 次重定向，同时受 --timeout 总时限约束。

流程顶层不再包含 id；不同文件允许 name 和 imports 别名重名。迁移旧文件时删除流程 id，将调用的 target 对象改为字符串名称，并为子流程声明对应 imports。工具名与当前作用域导入别名不得重复；冲突会在 validate/run 执行前报错。inspect 的 references 为 {target, path}。状态及 trace 使用 flowName、source 和 invocationId 定位，不写入 UUID。

## 命令和输入

### 内置脚本函数

`script.run` 是 CLI 内置宿主函数，使用普通 `call`，无需 `--functions`。
`code` 为必填 ES 模块源码，外部脚本使用 `import './main.js';` 引入，旧 `script` 参数已移除。
`input` 是 JSON，省略时为 `{}`，模块中直接读取全局 `input`。
通过 `result(value)` 设置 JSON 输出，步骤 `output` 保存结果；不立即退出，多次设置以最后一次为准，未设置返回 `null`。
顶层 await 完成后结束；默认导出函数不会自动调用，需要在代码中显式调用。
支持静态 import、再导出和字符串字面量动态 `await import("./module.js")`。
相对路径基于当前脚本，内联脚本基于流程文件；CLI 本地脚本可使用已安装 npm 包和 Node 内置模块，不自动安装依赖。
用户脚本不支持 `require` 或计算式动态导入。远程模块只允许 HTTPS，不得读取本地模块。
依赖准备和执行共用 CLI 全流程超时，每次调用的 Worker 在结束后终止，输入输出保持 JSON 边界。

完整规则见 [脚本与工作区](../../docs/scripts-and-workspace.md)，可运行示例：

```sh
pnpm cli run examples/script-workspace/flow.yaml --json
```

人工调用优先使用 `--set`，无需编写或转义 JSON，Windows PowerShell 也可直接运行：

```powershell
node dist/index.js run examples/add-one.yaml --set count=2 --json
node dist/index.js run examples/add-one.yaml --input examples/input.json --set count=5 --json
```

`run` 和 `validate` 支持重复的 `--set 字段=值`、`--set-string 字段=值`。按第一个 `=` 分割，字段名不得为空；空值 `--set message=` 是空字符串，带空格的参数整体加引号，例如 `--set "message=你好 世界"`。字段名是完整名字，`user.name` 不表示嵌套属性。

`--set` 将 JSON 写法的数字（如 `2`、`-3.5`、`2e2`）、小写 `true`/`false`、`null` 转为对应类型，其他值原样作为字符串；`001` 保留为字符串。非有限数值和超出安全整数范围的数字会报错，可用 `--set-string` 保留原文。`--set-string count=2` 始终得到字符串 `"2"`。数组和对象请继续使用 JSON 文件、内联 JSON 或 stdin。

覆盖顺序为：流程默认值 → 输入文件/内联 JSON/stdin → 按命令行出现顺序应用所有 `--set` 和 `--set-string`。同名字段最后一次覆盖生效，与 `--input` 在命令中的位置无关；只允许传入标记了 `input: true` 的字段。

Windows PowerShell 5.1 的原生程序参数传递可能丢掉内联 JSON 双引号，建议使用 `--set` 或输入文件；需要 JSON 管道时用 `' {"count":2} ' | node dist/index.js run examples/add-one.yaml --input - --json`。

流程、字段、每一步都可声明 `description`，输入输出参数复用对应字段的说明。`inspect` 展示全部说明（含嵌套步骤），trace 的步骤事件包含当前步骤说明；说明不改变运行行为。详见 [加一 YAML 示例](examples/add-one.yaml)。

流程文件同时支持 JSON、YAML，无需在打包或分发时转换。主流程与 imports 子流程可以混用格式，`run`、`inspect`、`validate` 使用同一个加载入口。

按文件扩展名选择解析器：`.yaml`、`.yml`（不区分大小写）使用 YAML，其余保持原有 JSON 读取行为，包括无扩展名文件。不通过内容猜测格式，不将错误 JSON 当作 YAML 重试。流程文件由 CLI 使用 `yaml` 包解析，两种文件都使用 core 的同一套结构校验。Core 另使用 YAML 序列化模板插入值，不负责流程文件加载。

YAML 使用 1.2 core schema，支持注释、多行文本和普通锚点/别名；一个文件只能包含一个文档。重复键、复杂映射键、自定义标签或旧版本指令会返回 `INVALID_YAML`。不启用 `<<` 合并键或 YAML 特有对象类型；别名展开由解析库限制（`maxAliasCount: 100`）。解析结果仍须满足流程的 JSON 数据约束，例如非有限数值和循环引用会被 core 拒绝。

需要字符串的数字或布尔值请加引号，例如 `initial: "2"`。省略 `initial` 仍表示 `undefined`；`initial: null` 或只有 `initial:` 都表示显式 `null`。这不会改变原有字段语义。

参数文件、内联输入和 stdin 当前仍使用 JSON；`--json` 结果及 JSONL trace 的格式也保持不变。

- `run`：执行流程，返回输出字段。
- `inspect`：只校验单个流程结构，列出名称、字段、默认值及调用引用。不会加载函数模块，不要求子流程已经提供；字段没有 `initial` 表示默认值为 `undefined`。
- `validate`：校验结构、输入、子流程引用、函数注册和映射，不执行节点。使用 `--functions` 时会导入模块，因此模块顶层代码仍会执行；应将业务操作放在函数体内。
- `--input <file>` 与 `--input-json <json>` 互斥，输入必须是对象；`--input -` 从 stdin 读取到 EOF。未指定则使用流程默认值，不自动读取 stdin。


## 输出协议 v1

`--json` 的 stdout 恰好输出一份 JSON，成功与失败均有版本和状态。此协议替换早期直接输出结果对象的行为：调用方应读取 `result`。

```json
{"version":1,"ok":true,"result":{"count":3}}
```

```json
{"version":1,"ok":false,"error":{"code":"DIVISION_BY_ZERO","message":"Cannot divide by zero.","flowName":"example","invocationId":"1:1","path":"steps[0]","callStack":[{"flowName":"example","invocationId":"1:1","path":"steps[0]"}]}}
```

校验和参数错误没有执行实例时，会省略实例和调用栈信息。宿主模块顶层日志、函数日志和直接写入 stdout 的内容均由执行子进程转发到父进程 stderr，不混入结果。

不带 `--json` 时使用 Node inspector 输出可读结果，支持 `undefined`、二进制及循环引用；显示深度为 8，不调用 getter 或自定义 inspector。JSON 输出复用 core 的 `toJsonValue`，复制后编码，不执行 getter/toJSON；遇到 `undefined`、非有限数值、循环引用、非普通对象、稀疏数组、额外数组属性、symbol 属性或不可枚举属性返回 `OUTPUT_NOT_JSON`。运行时本身仍支持这些任意值。

退出码：成功 `0`，普通失败 `1`，超时 `124`，收到 SIGINT/SIGTERM 中断 `130`。帮助文本使用常规终端格式，不属于机器结果协议。

## trace

`--trace <file.jsonl>` 创建新文件，拒绝覆盖已有文件。逐行记录 `start`、`initial`、`step-start`、`step-end`、`end`；每行包含 `version`、递增 `sequence` 和时间。每步包含执行实例、位置、耗时和调用栈状态；`returned` 保存本步所有退出栈的实例，包含多层子流程连续返回时的中间层。执行错误在事件中保留，超时也会写入结束原因，之前的完整记录仍可读。

父进程确认记录写入后才允许下一步执行，避免无界缓存。文件写入失败即终止运行并报错；文件关闭前不返回结果。不承诺断电时已进入操作系统缓存的数据仍持久存在。

默认不记录字段值。`--trace-values` 显式开启后，在初始状态和每步结束记录字段摘要，包括刚返回的子流程及更新后的父流程；保存的是当时的数据，不是仍会变化的对象引用。摘要最大深度 4、每个容器最多 50 项、每份摘要预算 200 项、字符串预览 256 字符；截断、循环引用、二进制、访问器等有明确类型标记，不能用于恢复执行。开启后仍可能含敏感数据；日志及异常消息也可能由宿主包含敏感内容。

## 超时和进程边界

默认执行上限 30 秒，可以使用环境变量 `SOYORI_TIMEOUT` 修改；显式 `--timeout` 优先于环境变量。两者支持整数毫秒及 `ms`、`s`、`m` 后缀（例如 `500ms`、`30s`、`2m`），必须为正数。计时从执行子进程启动开始，包含流程加载、模块导入、脚本下载和 Worker 执行、结果编码和逐步记录等待；用户输入文件/stdin 的读取在启动前完成。

父进程保持可响应，即使宿主函数同步无限循环或 Promise 永不返回，也可终止执行子进程。收到 Ctrl+C/SIGINT 或 SIGTERM 同样终止运行。流程完成后子进程退出，不保留宿主的后台定时器。

这不是不可信代码沙箱：函数模块具备当前用户权限，已发出的网络请求、文件写入等副作用不会回滚；宿主自行启动的其他进程不受本工具生命周期管理。

未实现交互调试、恢复执行及二进制结果文件导出。源码位于统一仓库的 packages/cli，开发包仍为 private，尚未发布到 npm。


### 文本模板示例

```sh
pnpm cli run packages/cli/examples/template.json --json
pnpm cli run packages/cli/examples/template.yaml --json
```

以上命令从总工作区运行。两个文件产生相同的 `chatOut`：保留换行，`$chatIn$` 替换输入，`$$99` 输出 `$99`。模板中未设置变量变为空字符串，数学和大小比较中变为 0，源值保持 undefined。旧 concat 节点已移除，schemaVersion 仍为 1。CLI 的 `--json` 输出协议保持 JSON，不受 Editor 的 Markdown/YAML 展示影响。

### Grouped flows and tool metadata

JSON/YAML can contain inline field groups and transparent `type: group` step sequences. `inspect` preserves field groups and reports step group names/default collapse metadata; traces retain nested `.steps[index]` paths without wrapper events. AI/storage functions and the built-in script function expose `.definition` input/output descriptions; `script.run` describes its dynamic whole return rather than inventing named result properties. See Core's [group protocol](../core/docs/groups-and-tools.md).

模型工具调用支持 tools 名称数组、toolCalls/message 输出及 tools.execute 批量执行。宿主工具需提供 definition；导入流程按当前调用作用域解析。参见总工作区 docs/tool-calling.md 与 examples/tool-calling.yaml。

## 通用基础工具

CLI 与 Editor 共用 soyori-tools，提供 time.now、web.fetch、web.search 和 math/text/array 库；这是 workspace 依赖。memory.init/save 与底层消息组装工具复用 CLI 的同一文件存储后端。协议见总仓库 [基础工具](../../docs/basic-tools.md) 与 [记忆工具](../../docs/memory-tools.md)。

## 环境与敏感字段

`env set <name> <value> [--sensitive]`、`env list`、`env delete <name>` 管理全局配置，支持 --storage-dir 和 --json。启动有效环境按 --env NAME=value > 操作系统环境 > 全局配置合并；--env 可重复，字符串保留等号与空值，不持久保存。env list 遮挡系统及敏感值并显示来源。已移除 --thread-id，threadId 是普通输入。

运行内 env.override({name,value,sensitive?}) 临时覆盖，env.load({path}) 按调用流程的相对本地路径读取 JSON 环境文件；远端流程不能加载本地配置。字符串简写默认敏感，元数据形式为 {value:string,sensitive:boolean}，2 MiB 上限；加载错误不部分覆盖。后续 LLM 与子流程读取更新值，运行结束即丢弃。env.get 返回原值，不自动传播敏感性。详见[环境手册](../../docs/handbook/agents/environment.md)。

## Soyori 改名兼容

CLI 命令为 `soyori`。`SOYORI_TIMEOUT`、`SOYORI_STORAGE_DIR`、`SOYORI_MODEL_CACHE` 分别优先于对应的旧 `AGENT_PLAN_*` 环境变量；显式 `--timeout` / `--storage-dir` 仍最高优先。CLI 默认配置、存储和模型缓存目录保留 agent-plan 标识以继续读取已有数据。源码位于 packages/cli，GitHub 主仓库名为 soyori；默认用户数据位置保留旧标识。
