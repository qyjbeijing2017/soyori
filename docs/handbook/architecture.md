# 架构与能力边界

理解职责分工，可以判断错误应该修流程、工具、宿主还是界面。嵌入 SDK 暂不推进，当前工作重点是现有 CLI、Editor 和它们共享的基础。

## 包与职责

| 部分 | 职责 |
| --- | --- |
| agent-plan-core | 结构校验、Operand、变量、节点、调度器、子流程、状态与错误 |
| agent-plan-cli | 磁盘/HTTP 来源加载、参数、宿主注册、子进程、trace、输出与退出码 |
| agent-plan-editor | IndexedDB Library、步骤和源码界面、对话、浏览器宿主与调试 UI |
| agent-plan-ai | 模型集成、消息编排、工具调用桥接与预算 |
| agent-plan-tools | 日期、网络、数学、文本、数组等共享工具 |
| agent-plan-storage | JSON 存储与各端后端 |
| agent-plan-script | 脚本校验、模块准备与共享协议，各端提供执行环境 |

Core 不读取网络、磁盘、凭据，不内置模型 SDK。CLI 和 Editor 负责加载流程依赖并注册工具，再交给唯一内核执行。

## 从文件到结果

宿主解析 JSON/YAML → Core parseFlow 校验 → 宿主解析 imports 成 LoadedFlow 图 → createRuntime 接收图、输入和函数 → step/run 推进 → getState 提供输出或错误。

创建 runtime 时复制并校验定义图，后续修改原始定义不改变当前运行。字段容器独立，运行输入和函数结果可保留对象引用，因此实时状态不保证能 JSON 序列化。

## 当前公开内核能力

parseFlow、inspectFlow、createRuntime 及工具定义辅助已导出。Runtime 提供 step、run、getState、getStack、setFields、reset；reset 仅根可用，旧子实例失效。

活跃链上的 step 推进栈顶；根 run 到根结束，子 run 到该子流程结束。共享调度器忙碌时不能并发推进或修改字段。状态含 ready/running/waiting/completed/failed/invalidated，busy、fields、nextStepPath、output/error。

Core 不自动超时、取消或重试；宿主执行环境和工具负责相应边界。没有恢复快照、任意跳转、共享远程会话或完整统一的暂停协议。

## Document 与助手

正式手册源文件位于 docs/handbook，目录元数据随网页加载，章节和搜索索引按需加载。Document 与 project.docs 共用读取模块，开发方向和历史记录不混进默认手册。

助手通过工具读取资料与文件，通过 flow.inspect/run 验证保存版本。工具成功是实际操作证据，模型文字本身不是。未来若要控制编辑器现场需要新的共享接口，不能靠文档冒充已实现。

## 平台与发布边界

浏览器网络受 CORS，本地工具取 Library 和 IndexedDB；CLI 取磁盘和用户存储。代码执行环境也不同。跨端移植先查 [平台矩阵](tools/contract.md)。

当前包依赖 pnpm workspace，Core/AI 等标记 private，尚未形成独立发布的嵌入 SDK。Windows/macOS/iOS/Android 原生封装、目录同步、MCP、远程共享调试不属于当前承诺。
