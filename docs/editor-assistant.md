# AgentPlan 助手与浏览器运行

当前实现说明，2026-10-11。流程执行语义仍由 Core 提供，助手使用普通步骤和显式工具循环。

正式手册与 Document 已共用 docs/handbook。真实 DeepSeek 连接已完成读取 scripts、查询工具、创建模块与流程、flow.inspect 和 flow.run，求和 [2,3,5] 得到 10。实测暴露原 output 摘要中的类型失真造成反复验证，因此新增有界真实 JSON result 与 resultAvailable/resultUnavailable；output 保留可读摘要用途，类型判断使用 result。补齐后同一实际连接复测返回 resultAvailable=true、result={answer:10}，助手正确确认 answer 是数字，未再次修改文件。

## 助手与新建流程

设置中的 auto 模式调用 `llm.auto`；有效环境中的 LLM_PROVIDER 优先于工具宿主设置，auto 根据连接回退后的完整远程配置选择 OpenAI、Anthropic，最后本地。参数与失败行为见[环境手册](handbook/agents/environment.md#自动选择模型工具)。

环境管理使用 `env.list`、`env.inspect`、`env.set`，契约见[环境与敏感值](handbook/agents/environment.md)。模型工具入口不开放原值 `env.get`，流程执行仍可使用它。助手只能写当前对话环境；敏感项只回传状态，设置参数的执行记录遮挡。`flow.run` 每次读取最新环境，支持设置后立即测试；显式敏感输出与错误遮挡，无自动敏感性传播或代码安全隔离。

- `agent-plan-editor/src/assistant.json` 是独立内置助手；`assistant-flow.ts` 按设置构造两个一致的 `llm.*` 调用。界面显示 AgentPlan助手，保留内部 ID `builtin-local-agent`，不改已有会话 ID。
- `src/example.json` 是 Library 首次模板及新建流程模板，使用 `llm.auto`，完整消息上下文的运行变量名为 `memory`。新建弹窗的名称和说明留空；不覆盖已保存的用户流程。
- 两种流程都使用 `memory.init → llm.* → memory.addAssistant → while → memory.save`。循环执行 `tools.execute → memory.addTools → llm.* → memory.addAssistant`，无工具请求时结束。
- `memory.init/save` 使用 `prefix/threadId`，默认前缀 `memory`。Chat 原始记录仍在 `threads/<threadId>`，两者分开；不迁移旧流程的记忆。接口见 [记忆工具](memory-tools.md)。
- 助手提示明确 Agent Plan 项目语境：“流程”指 JSON/YAML 流程文件，“根目录”指 Library 根目录。远程助手提供全部基础工具及项目操作工具；本地首先提供 `flow.create/workspace.list/project.tools/project.docs/time.now/web.search/web.fetch`，其余接口按需查询。skill 加载尚未实现。

## 项目文档、文件库与流程工具（2026-10-11）

这些是 Editor 宿主工具，供内置助手和用户流程调用，不在 CLI 注册。助手仍使用原有可编辑流程与 `tools.execute`；没有另建 Agent 引擎。

| 工具 | 行为 |
| --- | --- |
| `flow.create` | 复用 Editor 新建流程模板和保存服务。name/directory/description 可选；默认自动命名并存到 Library 根目录，无需追问类型、格式、名称或用途。指定名称冲突报错，不覆盖已有文件 |
| `project.docs` | 列出/检索正式手册 docs/handbook；path 接受章节 ID 或源路径，可按 section、offset、limit 分段读取，返回 version、headings、nextOffset 和来源。与 Document 页面使用同一套内容，正文与索引懒加载 |
| `project.tools` | 列出当前宿主的工具名称和用途，或按 name 返回完整参数接口 |
| `workspace.list/read` | 列文件元数据或读取 UTF-8 文本；read 返回 revision、总长度及截断标记 |
| `workspace.write/mkdir` | 创建文本/目录；替换已有文件必须提供 read 返回的 revision，在同一 IndexedDB 事务中检查版本；保留文件 ID |
| `workspace.move/copy/delete` | 复用 Library 原有操作；move 的 destination 是完整新路径，copy 的 directory 是目标目录。删除目录包含子项；不会自动改写流程引用 |
| `flow.inspect` | 读取已保存 JSON/YAML、解析工作区 imports，使用 Core 检查结构和调用目标并返回接口、步骤位置 |
| `flow.run` | 使用 Core 和同一宿主能力运行已保存流程，返回 status、revision、output（有界文本摘要）、结构化 error、调用栈和步骤记录 |

文本读写上限 2 MiB；分页默认 12000 字符、最多 20000，列表最多 500 项并标明截断。二进制/无效 UTF-8 拒绝文本读取。文件内容和工具结果不作为助手指令。修改前助手应读取完整文件，分页未读完不能直接覆盖。版本冲突报错，不静默覆盖；操作成功通知 UI 刷新文件库和流程列表。当前 Editor 未保存草稿不自动应用或合并。

目标流程单独创建运行器，复用现有对话/Editor 单任务占用；不得在目标流程内再次 `flow.run`，普通子流程仍按 Core 执行。每次最多 2000 步、120 秒，记录前 100 个事件，输出摘要最多 16000 字符。取消传递到模型、网络、脚本等支持取消的宿主；同步宿主代码无法被 AbortSignal 强制抢占，外部副作用不回滚。无执行现场恢复。

文件写入成功不代表 JSON/YAML 是有效流程；通过 `flow.inspect` 后才作为流程使用。内置助手提示要求查协议、读文件、保存、校验、运行并报告真实结果。模型是否正确完成这些操作仍需分别验证，尤其本地模型上下文有限，按需查接口不能保证小模型可靠完成复杂任务。

## 连接设置

`ai-settings.ts` 管理 OpenAI/Anthropic 的 `apiKey/baseURL/model` 和来源选择；`AiSettings.tsx` 展示密码输入、地址和模型 ID。模型 ID 由用户填写，需与服务匹配。

自动模式优先有 Key 的 OpenAI，再 Anthropic，否则本地。显式选择远程且其 Key 缺失时，选择另一已配置服务；均无 Key 则本地。显式本地始终使用本地。远程失败直接报错，不在失败后静默回退。

连接保存在当前浏览器 localStorage 的 `agent-plan-assistant-settings`。共享 AI 工具在远程请求前按步骤参数 > 有效应用环境 > 设置中的连接默认值 > 内置默认值补齐连接；Key 不注入助手流程、流程变量、记忆或导出文件。内置助手不固定设置 model。CLI 读取命令临时覆盖、系统环境与全局配置，不读取浏览器设置。变量名称和空值规则见[环境手册](handbook/agents/environment.md)。

浏览器直连服务，仍受 CORS 约束；OpenAI 地址默认为 `https://api.openai.com/v1`，Anthropic 默认为 `https://api.anthropic.com`。兼容接口必须支持相应请求与工具协议，不提供后端代理。

错误提示区分 HTTP 状态、网络失败与 SDK 请求/响应处理错误，不输出供应商原始错误消息（可能含凭据或提示词）。网络失败可能涉及 CORS、DNS、TLS 或连接问题，不能单凭提示断定 CORS。2026-10-11 对 DeepSeek `/chat/completions` 的无凭据 OPTIONS 及无效诊断 Key 的 401 响应均收到允许当前 localhost Origin 的跨域头；此探测不能替代真实 Key、模型、流式与工具协议联调。

2026-10-11 实际联调补充：恢复本地开发服务并重新打开最新页面后，用户配置的 DeepSeek OpenAI 兼容连接完成“现在的时间是？”请求，执行记录包含两次 llm.openai 与 time.now 工具调用，回复正确引用 Asia/Shanghai 的实际时间；没有新增代理。本次成功不代表已定位此前网络/SDK 错误的确切原因。

同一实际连接随后完成“帮我在根目录创建一个新的流程”，回复保存路径“新流程.yaml”，Library 根目录确认出现该文件，未追问名称、类型或格式。本地 Qwen 的同句复测被用户切换连接中断，不能将 DeepSeek 的成功归为本地模型已验证。

## 本地下载与初始化

当前模型为 `onnx-community/Qwen3-1.7B-ONNX`，固定 revision `b85539623180ae64303f37373d942cb0595ca44d`。浏览器使用 Q4F16/WebGPU，文件总量约 1.44 GB；CLI 优先 Q4F16/WebGPU，初始化失败回退 Q4/CPU（权重约 2.15 GB），生成失败不切换重试。文件大小不等于内存需求。

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
