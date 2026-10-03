# JSON 存储与 token 计数

记忆是流程变量。聊天、历史压缩和保存时机由子流程组织；这里仅提供通用存储和计数，不自动维护记忆，也不恢复运行现场。

## 流程工具

CLI 和 Editor 均可通过 `call` 使用以下工具（Editor 使用调用参数表单）：

| 工具 | inputs | 返回 |
| --- | --- | --- |
| `storage.read` | `key` | `{ found, value }`；缺失时 value 为 null |
| `storage.write` | `key, value` | `{ key }`；完整替换 |
| `storage.delete` | `key` | `{ deleted }`；缺失时 false |
| `storage.list` | 可选 `prefix` | `{ keys }`；排序后的 key 列表 |
| `tokens.count` | `text` 或 `messages`，可选 `mode` | `{ tokens, method, model }` |

存储只接受 JSON 数据；拒绝 undefined、非有限数、函数、循环引用、特殊对象、稀疏数组及 getter，避免静默丢数据。损坏、权限和配额错误会使当前步骤失败，不当作“没有数据”。同一 key 并发写入采用最后成功写入结果，不做合并或跨调用事务。

key 使用 `/` 分组；小写英文、数字、`-`、`_`、`.`，每段以字母、数字、`-` 或 `_` 开头且不以点结尾。禁止绝对路径、空段、反斜杠和 Windows 保留文件名。总长最多 240，每段最多 80 字符。`prefix` 是字面前缀，列出目录请使用 `assistant/`，避免匹配 `assistant-other/`。没有 namespace。

CLI 的 `assistant/memory/chat-001` 对应 `<storage>/assistant/memory/chat-001.json`。文件与目录同名会报错，例如 `a` 的文件与 `a.json/b` 的目录冲突；请勿将 `.json` 当作分组后缀。拒绝存储根目录内部的符号链接；本地文件工具不是对抗其他本机进程的安全沙箱。写入先创建同目录临时文件，再重命名替换；进程被强制终止可能留下 `.tmp`，列表会忽略它。

浏览器按完整 key 存入 IndexedDB 的 `agent-plan-storage` 数据库，事务完成后才报告成功。当前同源页面共享这一存储，通过 key 分组；不额外按工程隔离。浏览器可能清除站点数据，CLI 无法直接访问它。尚无浏览器存储管理页面、备份导入导出和同步。

## CLI 位置与配置

优先级：`--storage-dir` > `AGENT_PLAN_STORAGE_DIR` > 配置文件 `storageDir` > 系统默认目录。

| 系统 | 配置文件 | 默认存储目录 |
| --- | --- | --- |
| Windows | `%APPDATA%/agent-plan/config.json` | `%LOCALAPPDATA%/agent-plan/storage` |
| macOS | `~/Library/Application Support/agent-plan/config.json` | `~/Library/Application Support/agent-plan/storage` |
| Linux | `$XDG_CONFIG_HOME/agent-plan/config.json`，默认 `~/.config` | `$XDG_DATA_HOME/agent-plan/storage`，默认 `~/.local/share` |

配置不存在时直接采用默认值；配置损坏时报错。参数和环境变量的相对路径相对于当前工作目录；`config set` 保存绝对路径。更换目录不会移动旧数据。配置目录固定，不依赖存储位置。

```powershell
pnpm cli config set storage-dir D:\agent-data
pnpm cli storage info
pnpm cli run examples/storage-tokens.json --storage-dir ./.agent-plan/storage --json
pnpm cli storage list demo/ --storage-dir ./.agent-plan/storage
pnpm cli storage get demo/memory --storage-dir ./.agent-plan/storage --json
pnpm cli storage delete demo/memory --storage-dir ./.agent-plan/storage
```

管理命令支持 `--json`，复用 CLI 版本化成功/错误协议。`delete` 明确指定单个 key 后立即删除，不需要额外确认；第一版没有批量删除命令。`info` 显示目录、配置文件路径和来源。Node 宿主可从 `agent-plan-storage/node` 导入 `createFileStorage(directory)`，自行注入根目录。

## token 计数

- `mode: "local"`（默认）：使用当前 LFM2.5-350M tokenizer 实际计算，仅下载/读取 tokenizer 文件，不加载模型权重、不要求 WebGPU。`text` 统计裸文本且不添加特殊 token；`messages` 使用与本地生成一致的聊天模板及生成前缀。返回 `method: "tokenizer"` 和固定模型 ID。浏览器需要先允许本地下载。
- `mode: "estimate"`：不联网，以 UTF-8 字节数加消息开销估算，返回 `method: "estimate", model: null`。适合初步测试，可能明显高估，且不是所有供应商 token 数的严格上界，不能用于计费或保证远程请求不超限。
- `messages` 仅支持 system/user/assistant 的文本消息，与目前生成工具保持一致。text 和 messages 必须且只能提供一个。
- 计数只包含输入。流程应另行预留输出预算与安全余量；当前本地模型输入加输出限制为 2048 tokens。远程供应商的精确计数 API 尚未接入。
- tokenizer 文件与现有本地模型共用缓存；CLI 使用 `AGENT_PLAN_MODEL_CACHE` 或 `~/.cache/agent-plan/models`。

测试示例连续运行两次，第二次 `previous` 能读到上次保存的数据。要测试精确计数，将示例计数步骤的 mode 改成 local；首次运行给 tokenizer 下载留出超时预算。压缩子流程尚未内置。
