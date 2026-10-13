# CLI 使用与命令参考

CLI 是人和程序共用的进程接口，与 Editor 复用 Core 和部分工具包。命令在总工作区执行，路径是磁盘路径，不是浏览器 Library。

## 准备工作区

使用项目规定的 Node 24 和 pnpm，检出总仓库及 core/cli 子模块，先安装并构建。包目前为 private，不能假设已发布到 npm。

```powershell
pnpm install
pnpm build
pnpm cli --help
pnpm cli run --help
pnpm cli run docs/handbook/examples/hello/hello.yaml --set name=小明 --json
```

CLI 子仓库依赖 workspace 包，独立克隆并安装不等于可用的发布包。

## 命令

| 命令 | 用途 |
| --- | --- |
| `run <flow-file>` | 加载全部依赖并执行 |
| `inspect <flow-file>` | 校验单文档结构，列字段、步骤、引用，不加载依赖或函数模块 |
| `validate <flow-file>` | 检查结构、输入、全部依赖和目标，不执行步骤 |
| storage info | 显示实际存储和配置路径及来源 |
| storage list [prefix] | 列字面前缀匹配的 key |
| `storage get <key>` | 读取一个记录 |
| `storage delete <key>` | 立即删除指定单个 key |
| `config set <name> <value>` | 设置支持的配置，当前 storage-dir |
| `env set <name> <value>` | 保存全局环境值；--sensitive 遮挡 |
| env list | 查看有效环境，敏感值遮挡 |
| `env delete <name>` | 删除指定作用域的一项环境值 |

各命令用 --help 查询完整帮助。storage 子命令支持 --storage-dir、--json，config set 支持 --json。

## 流程命令参数

| 参数 | 适用 | 行为 |
| --- | --- | --- |
| --json | run/inspect/validate | 版本化机器输出 |
| `--storage-dir <directory>` | 三者 | 覆盖存储位置 |
| `--env <NAME=value>` | run/validate | 临时字符串环境覆盖，可重复；优先于系统环境和全局配置 |
| `--timeout <duration>` | 三者 | 默认 30000 ms，支持 ms/s/m，正整数 |
| `--input <file.json>` | run/validate | 输入对象；- 从 stdin 读到 EOF |
| `--input-json <json>` | run/validate | 内联对象，与 --input 互斥 |
| `--set <field=value>` | run/validate | 可重复，数字/true/false/null 转型，否则文字 |
| `--set-string <field=value>` | run/validate | 可重复，始终原文字符串 |
| `--flows <alias=source>` | run/validate | 添加根 imports，不覆盖已有别名 |
| `--functions <module.mjs>` | run/validate | 默认导出函数注册表的本地 ESM 模块 |
| `--trace <file.jsonl>` | run | 创建新 trace，拒绝覆盖 |
| --trace-values | run | 采集有限字段摘要 |

输入优先级是初值 → input 文件/内联/stdin → 按顺序应用 set/set-string，同字段最后覆盖。字段名按完整名字，不把 user.name 当路径。--set count=001 保持字符串；非有限和不安全整数拒绝，可用 set-string。对象数组用 JSON 输入文件。

PowerShell 推荐 --set 或输入文件，避免内联 JSON 引号传递问题。未指定 --input - 不会自动等 stdin。

## 流程与模块加载

入口和 imports 支持磁盘及 HTTP(S)，相对导入基于导入方，远程相对路径基于最终 URL。远程来源及重定向不能访问本地文件。每份流程最多 2 MiB，图最多 256 份文档，网络下载最多 10 秒和 5 次重定向，并受总超时约束。

文件扩展名 yaml/yml 使用 YAML 1.2 core schema，其余使用 JSON。一个文件一个文档，拒绝重复键、复杂键、自定义标签和循环等非 JSON 数据。不支持 YAML 合并键。运行输入仍是 JSON。

--functions 路径相对命令目录，示例模块：

```js
export default {
  greet: ({ name }) => ({ answer: `你好，${name}！` }),
};
```

节点 target=greet，inputs 传 name，outputs 取 answer。直接 call 可调用无接口函数；提供给模型时需 ToolDefinition。validate 导入模块会运行顶层代码，业务副作用应放函数体。内置保留工具不能被覆盖。

## 机器结果与错误

--json 的 stdout 输出恰好一个 JSON：

```json
{"version":1,"ok":true,"result":{"chatOut":"你好，小明！"}}
```

失败为 `{version:1,ok:false,error:{code,message,...}}`，执行错误还可有 source、flowName、invocationId、path、callStack。日志和模型进度写 stderr。退出码成功 0、普通失败 1、超时 124、中断 130。

没有 --json 使用可读 JS 输出；JSON 模式拒绝不可 JSON 的值并报 OUTPUT_NOT_JSON，不静默丢 undefined。不带 JSON 的展示和 trace 摘要都不等于可恢复状态。

## 存储配置与调试

```powershell
pnpm cli storage info --json
pnpm cli config set storage-dir ./agent-data --json
pnpm cli storage list memory/ --json
pnpm cli run docs/handbook/examples/subflows/main.yaml --trace run-002.jsonl --trace-values --timeout 30s --json
```

config 更改用户配置，不移动已有数据。每次 trace 使用新文件名；--trace-values 可能写出凭据。运行子进程隔离 stdout 并可被超时终止，不是安全沙箱，外部效果不能回滚。

工具平台矩阵见 [工具契约](../tools/contract.md)。CLI 没有网页助手的 workspace/project/flow 工具，也没有持久调试服务或恢复执行协议。
