# 工具契约与平台支持

工具通过“调用”步骤执行。大部分工具在 CLI 和 Editor 中使用相同的名称和参数；少数工具只在网页助手中提供，下表列出差异。

本页的“工具定义”和“统一调用规则”供编写工具或排查接口问题时参考。初次使用可先看[工具总览中的完整例子](reference.md#如何阅读工具说明)，再查具体工具。

## 工具定义

Core 的 RuntimeFunction 接收一个输入对象，可同步返回或返回 Promise。函数可携带 ToolDefinition：name、description、inputs、outputs 和可选 returns。参数可声明 valueType、required、defaultValue、initial、placeholder，也可组成展示分组。

defaultValue 描述处理函数的默认行为，不自动写入节点；initial 是编辑器选择工具时插入的 Operand。分组不改变调用输入结构。

定义用于表单和模型工具参数生成，不是第二套自动校验器。处理函数负责验证实际输入。流程工具的输入输出从标记的字段生成；提供给模型的宿主函数必须有接口定义。

## 统一调用规则

节点 inputs 先按 Operand 解析，再调用函数。工具返回值保持原样；output 保存整体，outputs 选择直接属性。Promise 完成前不能推进共享调度器。抛错使当前步骤失败，未提交的输出不回写，外部效果不回滚。

工具自己拥有输入限制和错误前缀，例如 WEB_NETWORK、AI_CONFIG、BASIC_INPUT。Core 提供带流程和步骤位置的失败信息；目前不是所有宿主错误都使用同一种结构，助手应同时查看结构化位置与 message。

## 实际支持矩阵

| 工具 | CLI | Editor | 主要差异 |
| --- | --- | --- | --- |
| time.now、math.*、text.*、array.* | 有 | 有 | 默认时区取当前宿主 |
| web.fetch、web.search | 有 | 有 | 浏览器受 CORS 和请求头规则约束 |
| storage.read/write/delete/list | 有 | 有 | 磁盘 JSON 与 IndexedDB，不自动同步 |
| env.get/override/load | 有 | 有 | 启动配置来源不同；运行内覆盖不持久化 |
| env.list/inspect/set | 无 | 助手专属 | 查看遮挡后的状态；set 只写当前对话 |
| tokens.count | 有 | 有 | local 模式需 tokenizer；浏览器需允许下载 |
| memory.init/save/setSystem/addUser/addAssistant/addTools | 有 | 有 | init/save 使用各端存储 |
| llm.auto/openai/anthropic/local | 有 | 有 | 两端均支持参数与有效环境回退；浏览器 WebGPU，CLI 优先 GPU、初始化失败回退 CPU |
| tools.execute | 有 | 有 | 根据当前作用域、注册表和共享预算执行 |
| script.run | 有 | 有 | 文件与模块来源、包支持、超时范围不同 |
| project.docs/tools | 无 | 有 | 当前是 Editor 助手接口 |
| workspace.list/read/write/mkdir/move/copy/delete | 无 | 有 | 当前操作 Library 文件库 |
| flow.create/inspect/run | 无 | 有 | 当前助手操作保存流程，不控制编辑草稿 |

CLI 的 inspect/run 命令和助手 flow.inspect/run 不是同一个工具接口。命令行可以做相应操作，但不能据此认为工具名称已经注册。

## 如何发现工具

Editor 的调用选择器显示当前可用工具。内置助手通过 project.tools 查询注册表；name 参数读取具体定义。CLI 可以编排已有内置工具或用 --functions 注册自定义函数，目前没有 project.tools 查询命令。

开发工具时应明确输入、默认值、返回、错误、副作用、超时与取消。共享工具修改应同步两端行为验证及本手册的平台矩阵；未实现能力不能登记为已支持。
