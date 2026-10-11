# 快速入门

先用一个没有网络、脚本和模型依赖的流程，理解输入到输出的完整过程。预期结果是输入名字后返回问候文本。

## 导入第一个流程

在本章点击「导入示例」选择「第一个流程」，然后点击「在编辑器打开」。示例复制到 Library 的独立目录，不覆盖用户文件，也不自动运行。

也可以把下面内容保存为 `hello.yaml`，在 Library 上传。有效流程可以打开表单编辑器；普通文件或格式错误的流程仍保留在文件库，可打开源码修复。

```yaml
schemaVersion: 1
name: 手册问候
description: 输入名字，输出一句问候。
fields:
  - name: name
    input: true
    initial: 世界
  - name: chatOut
    output: true
steps:
  - type: template
    template: 你好，$name$！
    output: $chatOut
```

## 输入并运行

打开 Editor，在运行输入中把 `name` 设为 `小明`，运行。输出字段应为：

```json
{"chatOut":"你好，小明！"}
```

省略输入时使用初值 `世界`。`input: true` 允许接收同名输入；`output: true` 决定哪些字段出现在结果中。运行输入的名字是 `name`，步骤里的读取和写入才使用 `$name` 和 `$chatOut`。

## 修改并验证

把模板改为 `欢迎，$name$。`，提交步骤修改，再用相同输入重新运行。预期输出变成 `欢迎，小明。`。步骤表单提交会保存；源码编辑需要确认保存。尚未提交的修改和 Library 文件不是同一份已保存状态。

点击单步执行时，这个流程只执行一个模板节点。可在变量面板查看 `chatOut`，再对照输出。需要增加计算或条件时，查 [节点参考](flows/language.md)。

## 在 CLI 运行同一文件

从总工作区执行：

```powershell
pnpm cli run docs/handbook/examples/hello/hello.yaml --set name=小明 --json
```

预期 stdout 是协议包装后的结果：

```json
{"version":1,"ok":true,"result":{"chatOut":"你好，小明！"}}
```

首次准备开发工作区的方法见 [CLI](cli/guide.md)。命令中的路径是磁盘路径，网页的 Library 路径则属于浏览器文件库。

## 开始使用助手

在设置中配置可用模型，切到对话。可以说「帮我在根目录创建一个新流程」，助手使用 `flow.create` 保存并报告实际路径。这个工具默认使用现有聊天模板；配置助手使用远程模型，不会自动改写用户流程里的 `llm.local` 节点。

让助手编写特定流程时说明输入和期望输出，例如「创建一个输入名字并输出问候的流程，保存后验证」。遇到模型连接问题查 [模型设置](agents/models.md)，遇到流程问题查 [调试](debugging/guide.md)。
