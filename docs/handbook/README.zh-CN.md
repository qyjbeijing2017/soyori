# Soyori Document 使用手册

[English](README.md) | **简体中文** | [项目 README](../../README.zh-CN.md)

这里是 Editor 的 Document 页面与内置助手共用的手册，可直接在 GitHub 阅读。章节、截图和示例均使用仓库相对路径。

先选择电脑、手机或 CLI 入门，再学习记忆和工具。示例列可以直接打开完整文件；在 GitHub 文件页使用 Raw 或 Download raw file 保存，多文件示例需保留相对路径。Editor 内的章节还提供“导入示例”按钮，将同一组文件复制到文件库。

[官网 / 在线编辑器](https://soyori.joycows.com) · [在线手册](https://soyori.joycows.com/#document/introduction)，可在设置中切换中文或 English。Bug 请通过 [GitHub Issues](https://github.com/qyjbeijing2017/soyori/issues) 提交，其他联系方式见[产品简介](introduction.md)。

<!-- Generated from index.json and en/index.json by scripts/handbook-index.mjs. -->

## 开始使用

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [什么是 Soyori](introduction.md) | 产品概念、阅读路线、已实现能力与边界。 | — |
| [快速入门：Editor（电脑端）](quick-start.md) | 从新建流程开始，创建字段、拼合提示词、调用模型并查看回复。 | — |
| [快速入门：Editor（手机端）](quick-start-mobile.md) | 手机图文入门：新建流程、创建字段、拼合提示词并调用模型。 | — |
| [快速入门：YAML + CLI](quick-start-cli.md) | 逐步编写 YAML：创建字段、拼合提示词、调用模型及查看运行记录。 | — |
| [快速入门 2：使用记忆](quick-start-memory.md) | 读取和保存消息历史，让同一段对话记住用户说过的话。 | [入门 2：会记忆的助手](examples/quick-memory/memory-chat.yaml) |
| [快速入门 3：使用工具](quick-start-tools.md) | 先直接查询时间，再让 AI 请求工具、读取结果并继续回答。 | [入门 3：直接查询时间](examples/quick-tools/time-tool.yaml) · [入门 3：AI 使用时间工具](examples/quick-tools-agent/tool-agent.yaml) |

## 1. 流程

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [概览](flows/language.md) | 流程是什么、如何编辑，以及 YAML 文件的基本组织方式。 | [字段：常量](examples/constants/constants.yaml) |
| [字段：类型](flows/types.md) | 了解类型的用途与自动识别；无需先学会类型，也能开始使用字段。 | [字段：常量](examples/constants/constants.yaml) · [字段：对象与列表](examples/objects/objects.yaml) |
| [字段：常量](flows/constants.md) | 认识直接填写的固定值，以及常量的填写位置和使用方式。 | [字段：常量](examples/constants/constants.yaml) |
| [字段：变量](flows/variables.md) | 认识变量的用途，学习声明字段、读取当前值和保存结果。 | [字段：声明与引用](examples/variables/variables.yaml) |
| [字段：对象与列表](flows/objects.md) | 把一个人的多项信息放进对象，把多个项目放进列表，并读取其中内容。 | [字段：对象与列表](examples/objects/objects.yaml) |
| [步骤：字段操作](flows/assignment.md) | 设置字段内容，或在列表末尾追加一项，供后面的步骤使用。 | [步骤：字段操作](examples/assignment/assignment.yaml) |
| [步骤：流程控制](flows/control.md) | 根据条件选择做什么，或重复执行一组步骤直到条件不再成立。 | [步骤：流程控制](examples/control/control.yaml) |
| [步骤：文本处理](flows/text.md) | 把固定文字和字段内容拼成提示词或回复，了解两种引用写法。 | [步骤：文本处理](examples/text/text.yaml) |
| [步骤：数学运算](flows/math.md) | 进行加、减、乘、除，把结果保存到字段。 | [步骤：数学运算](examples/math/math.yaml) |
| [步骤：比较](flows/comparison.md) | 判断是否相等或大小关系，得到“是 / 否”的结果。 | [步骤：比较](examples/comparison/comparison.yaml) |
| [步骤：逻辑运算](flows/logic.md) | 组合多个条件：全部满足、任一满足或取反。 | [步骤：逻辑运算](examples/logic/logic.yaml) |
| [步骤：调用](flows/calling.md) | 选择工具或子流程，填写输入，并把需要的结果保存到字段。 | [步骤：调用](examples/calling/calling.yaml) |
| [步骤：分组与说明](flows/groups.md) | 把相关字段或步骤收进分组，折叠查看并添加说明。 | [步骤：分组与说明](examples/groups/groups.yaml) |
| [字段：路径与边界参考](flows/operands.md) | $ 引用、$$ 转义、模板、对象数组与写入边界。 | — |
| [子流程与调用](flows/subflows.md) | 把可重复使用的操作保存为子流程，传入内容并接收结果。 | [子流程调用](examples/subflows/main.yaml) |

## 2. 编辑器

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [对话：助手、thread 与执行记录](editor/chat.md) | 选择 Agent、发送消息、管理对话和查看运行记录。 | — |
| [文件库：文件、上传与下载](workspace.md) | 保存和整理浏览器中的文件，编辑源码、上传文件和备份工程。 | — |
| [流程编辑：字段与当前值](editor/values.md) | 添加字段、设置输入输出，区分默认值与当前测试值。 | — |
| [流程编辑：步骤、源码与保存](editor/flow.md) | 步骤表单、嵌套块、源码编辑和保存。 | — |
| [流程编辑：运行与调试](debugging/guide.md) | 逐步执行、错误定位、脚本修复、嵌套调用栈、预算和 trace。 | [修复除零错误](examples/debugging/broken.yaml) |
| [设置：模型连接与数据保存](editor/settings.md) | 模型连接、本地模型准备、浏览器数据与备份。 | — |

## 3. CLI

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [CLI 使用与命令参考](cli/guide.md) | 工作区安装、所有命令、参数、存储配置、输出协议与 trace。 | — |

## 4. 环境变量

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [环境变量：共同原理与运行覆盖](agents/environment.md) | 区分运行配置与字段，了解覆盖顺序、模型连接和敏感值。 | — |
| [环境变量：CLI](environment/cli.md) | 全局配置、操作系统、--env 与临时覆盖。 | — |
| [环境变量：Editor](environment/editor.md) | 全局、对话和当前文件测试环境的图文操作。 | — |

## 5. 内置工具

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [工具调用约定与平台支持](tools/contract.md) | 共享工具的定义、调用规则、实际平台支持和宿主差异。 | — |
| [内置工具总览](tools/reference.md) | 从完整例子学会使用工具，再按用途查阅具体参数与返回内容。 | — |
| [数学、文本与列表](tools/basic.md) | 逐个说明数学、文本与列表工具的用途、参数、返回、示例与错误。 | — |
| [时间与网络](tools/web.md) | 逐个说明时间与网络工具的用途、参数、返回、示例与错误。 | [测试搜索服务](examples/web-search/search.yaml) |
| [存储与 token](tools/storage.md) | 逐个说明存储与 token 工具的用途、参数、返回、示例与错误。 | — |
| [记忆编排](tools/memory.md) | 逐个说明记忆编排工具的用途、参数、返回、示例与错误。 | — |
| [模型调用](tools/models.md) | 逐个说明模型调用工具的用途、参数、返回、示例与错误。 | — |
| [运行环境](tools/environment.md) | 逐个说明运行环境工具的用途、参数、返回、示例与错误。 | — |
| [工具执行与脚本](tools/execution.md) | 逐个说明工具执行与脚本工具的用途、参数、返回、示例与错误。 | — |
| [助手文件与调试工具](tools/assistant.md) | project.docs/tools、workspace、flow.create/inspect/run 的完整接口与修复闭环。 | — |

## 6. 脚本

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [脚本开发](scripts/development.md) | 需要自定义处理时使用 JavaScript，学习传入数据、返回结果和导入文件。 | [脚本与模块](examples/scripts/flow.yaml) |

## 7. Agent 组合示例

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [模型与 Agent 工具循环](agents/models.md) | 理解模型怎样请求工具，并用流程把执行结果交回模型。 | [模型、工具循环与记忆](examples/agent/agent.yaml) |
| [存储与对话记忆](agents/storage.md) | 保存下次还要使用的数据，区分聊天记录、流程记忆与当前字段。 | — |

## 附录

| 章节 | 内容 | 示例 |
| --- | --- | --- |
| [架构与能力边界](architecture.md) | Core、CLI、Editor 与工具包的职责，当前公开 API 与未实现能力。 | — |

## 完整示例文件

| 示例 | 入口流程 | 全部文件 |
| --- | --- | --- |
| 单轮翻译助手 | [translate.yaml](examples/translate/translate.yaml) | [translate.yaml](examples/translate/translate.yaml) |
| 第一个流程 | [hello.yaml](examples/hello/hello.yaml) | [hello.yaml](examples/hello/hello.yaml) |
| 循环计数 | [counter.yaml](examples/counter/counter.yaml) | [counter.yaml](examples/counter/counter.yaml) |
| 子流程调用 | [main.yaml](examples/subflows/main.yaml) | [main.yaml](examples/subflows/main.yaml) · [add-one.yaml](examples/subflows/add-one.yaml) |
| 脚本与模块 | [flow.yaml](examples/scripts/flow.yaml) | [flow.yaml](examples/scripts/flow.yaml) · [lib/greet.js](examples/scripts/lib/greet.js) |
| 修复除零错误 | [broken.yaml](examples/debugging/broken.yaml) | [broken.yaml](examples/debugging/broken.yaml) · [fixed.yaml](examples/debugging/fixed.yaml) |
| 字段：常量 | [constants.yaml](examples/constants/constants.yaml) | [constants.yaml](examples/constants/constants.yaml) |
| 字段：声明与引用 | [variables.yaml](examples/variables/variables.yaml) | [variables.yaml](examples/variables/variables.yaml) |
| 字段：对象与列表 | [objects.yaml](examples/objects/objects.yaml) | [objects.yaml](examples/objects/objects.yaml) |
| 步骤：字段操作 | [assignment.yaml](examples/assignment/assignment.yaml) | [assignment.yaml](examples/assignment/assignment.yaml) |
| 步骤：流程控制 | [control.yaml](examples/control/control.yaml) | [control.yaml](examples/control/control.yaml) |
| 步骤：文本处理 | [text.yaml](examples/text/text.yaml) | [text.yaml](examples/text/text.yaml) |
| 步骤：数学运算 | [math.yaml](examples/math/math.yaml) | [math.yaml](examples/math/math.yaml) |
| 步骤：比较 | [comparison.yaml](examples/comparison/comparison.yaml) | [comparison.yaml](examples/comparison/comparison.yaml) |
| 步骤：逻辑运算 | [logic.yaml](examples/logic/logic.yaml) | [logic.yaml](examples/logic/logic.yaml) |
| 步骤：调用 | [calling.yaml](examples/calling/calling.yaml) | [calling.yaml](examples/calling/calling.yaml) |
| 步骤：分组与说明 | [groups.yaml](examples/groups/groups.yaml) | [groups.yaml](examples/groups/groups.yaml) |
| 模型、工具循环与记忆 | [agent.yaml](examples/agent/agent.yaml) | [agent.yaml](examples/agent/agent.yaml) |
| 入门 2：会记忆的助手 | [memory-chat.yaml](examples/quick-memory/memory-chat.yaml) | [memory-chat.yaml](examples/quick-memory/memory-chat.yaml) |
| 入门 3：直接查询时间 | [time-tool.yaml](examples/quick-tools/time-tool.yaml) | [time-tool.yaml](examples/quick-tools/time-tool.yaml) |
| 入门 3：AI 使用时间工具 | [tool-agent.yaml](examples/quick-tools-agent/tool-agent.yaml) | [tool-agent.yaml](examples/quick-tools-agent/tool-agent.yaml) |
| 测试搜索服务 | [search.yaml](examples/web-search/search.yaml) | [search.yaml](examples/web-search/search.yaml) |
