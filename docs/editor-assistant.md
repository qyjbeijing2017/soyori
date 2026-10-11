# AgentPlan 助手与浏览器运行

当前实现说明，2026-10-11。流程执行语义仍由 Core 提供，助手使用普通步骤和显式工具循环。

## 助手与新建流程

- `agent-plan-editor/src/assistant.json` 是独立内置助手；`assistant-flow.ts` 按设置构造两个一致的 `llm.*` 调用。界面显示 AgentPlan助手，保留内部 ID `builtin-local-agent`，不改已有会话 ID。
- `src/example.json` 是 Library 首次模板及新建流程模板，继续使用本地模型。新建弹窗的名称和说明留空；不覆盖已保存的用户流程。
- 两种流程都使用 `memory.init → llm.* → memory.addAssistant → while → memory.save`。循环执行 `tools.execute → memory.addTools → llm.* → memory.addAssistant`，无工具请求时结束。
- `memory.init/save` 使用 `prefix/threadId`，默认前缀 `memory`。Chat 原始记录仍在 `threads/<threadId>`，两者分开；不迁移旧流程的记忆。接口见 [记忆工具](memory-tools.md)。
- 助手提示只描述通用行为；查询接口和字段由工具定义说明，不在系统提示中编写网站拼接或日期前置步骤。远程助手提供全部基础工具，本地保留 `time.now/web.search/web.fetch` 以控制上下文开销。skill 加载尚未实现。

## 连接设置

`ai-settings.ts` 管理 OpenAI/Anthropic 的 `apiKey/baseURL/model` 和来源选择；`AiSettings.tsx` 展示密码输入、地址和模型 ID。模型 ID 由用户填写，需与服务匹配。

自动模式优先有 Key 的 OpenAI，再 Anthropic，否则本地。显式选择远程且其 Key 缺失时，选择另一已配置服务；均无 Key 则本地。显式本地始终使用本地。远程失败直接报错，不在失败后静默回退。

连接保存在当前浏览器 localStorage 的 `agent-plan-assistant-settings`。`BrowserAiHost.tools()` 在远程请求前补齐缺失的连接参数，调用步骤显式参数优先；Key 不注入助手流程、流程变量、记忆或导出文件。Key 在此浏览器存储中保存，不是服务器账户凭据库。CLI 仍从调用输入获取连接，不读取此浏览器设置。

浏览器直连服务，仍受 CORS 约束；OpenAI 地址默认为 `https://api.openai.com/v1`，Anthropic 默认为 `https://api.anthropic.com`。兼容接口必须支持相应请求与工具协议，不提供后端代理。

## 本地下载与初始化

当前模型为 `onnx-community/Qwen3-1.7B-ONNX`，固定 revision `b85539623180ae64303f37373d942cb0595ca44d`。浏览器使用 Q4F16/WebGPU，文件总量约 1.44 GB；CLI 使用 Q4/CPU，权重约 2.15 GB。文件大小不等于内存需求。

`ModelDownloadManager` 管理模型和 tokenizer 文件；Cache API `agent-plan-model-files-v1` 保存完整文件，IndexedDB `agent-plan-model-downloads` 保存下载分块。暂停/继续使用 Range，停止或释放保留已下载数据。进度在设置及主界面展示，下载完成后隐藏进度条。刷新可恢复下载数据，不能恢复执行现场。

初始化与下载分开：`BrowserAiHost.initialize()` 共享加载任务，状态为 idle/initializing/ready/error。默认按需加载，仅实际本地调用在对话显示初始化动画与“可能需要几分钟”；设置展示状态。后台初始化默认关闭，其偏好独立保存在 `agent-plan-background-initialization`，只预热不生成回复。

成功初始化后复用推理会话；失败、停止或释放清理 Worker 和内存，完整文件缓存保留。关闭后台初始化取消进行中的预热，已就绪会话保留到释放。首次冷加载仍可能耗时数分钟，手机实机及当前模型 CLI CPU 推理尚未验证。

## 流式预览与执行记录

模型调用向宿主发送 start/text/metrics 事件。Editor 显示临时文本，过滤 thinking 和工具调用标记；最终由流程 `chatOut` 替换。临时预览不写入原始对话，每次模型调用重新开始预览。

每条回复的执行记录入口对应该轮运行。`chat-execution.ts` 只在内存保留最多 8 轮、总文本约 512 KB；每轮至多 100 条、约 128 KB，截断会标记。变量快照默认关闭，只对后续运行生效；刷新清除，不能用于恢复执行。

运行期间允许切页面、切会话、新建对话及删除其他会话；预览、错误和完成回复归属原线程。当前运行会话需先停止才能删除。共享宿主只允许运行一个对话/编辑器执行任务。会话保存串行合并最新数据，避免完成时恢复旧选择或已删除线程。

## 代码与验证入口

| 模块 | 责任 |
| --- | --- |
| `agent-plan-ai` | 共享供应商适配、消息组装、工具调用格式、流式事件、本地推理 |
| `agent-plan-tools` | HTTP、搜索、日期及数学/文本/数组基础工具 |
| `assistant-flow.ts` / `ai-settings.ts` | 内置助手流程构造与浏览器连接设置 |
| `ai-host.ts` / `local-model.worker.ts` | 凭据注入、初始化、Worker 与取消 |
| `model-download*.ts` / `model-files.ts` | 文件清单、完整缓存与断点续传 |
| `AgentChat.tsx` / `chat-execution.ts` | 线程归属、临时预览与有界记录 |

运行根目录 `pnpm verify`，Editor 生产构建用 `pnpm --filter agent-plan-editor build`。`assistant.test.mjs` 验证选择、模板隔离和设置恢复；`model-initialization.test.mjs` 验证共享初始化与模拟 OpenAI/Anthropic 请求；`memory-preset.test.mjs` 验证完整工具循环和成功才保存记忆。测试不下载模型、不消耗真实付费 API。

桌面浏览器已验证本地生成、实际工具往返及切页后的线程归属。小模型仍可能选错工具、重复追问或错误解读结果；搜索覆盖与最新新闻也不保证。真实付费服务账号尚未联调，模拟协议通过不能替代模型质量或手机兼容性验证。
