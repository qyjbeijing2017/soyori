# 快速入门：YAML + CLI

从一个空 YAML 文件开始，做一个**单轮翻译助手**：填写中文 → 拼合提示词 → 调用模型 → 得到英文。

流程与 [电脑端 Editor](quick-start.md)、[手机端 Editor](quick-start-mobile.md) 教程相同。以下命令使用 PowerShell，在准备存放流程文件的文件夹中执行，不需要下载项目源码。

## 1. 准备 CLI

安装 Node.js 24 或更新版本（包含 npm），然后执行：

```powershell
npm install -g soyori-cli
soyori --help
```

已经安装 CLI 可以跳过。安装只准备运行程序，模型文件在需要时另行下载。后面使用 `soyori` 命令，不需要 pnpm。

## 2. 准备模型（可选）

**不填写模型连接信息，也可以运行。** 没有已有 API 配置时，`llm.auto` 默认使用本地 **Qwen3-1.7B-ONNX**（`onnx-community/Qwen3-1.7B-ONNX`）。CLI 优先使用 GPU，Q4F16 权重约 **1.44 GB**；GPU 初始化失败后回退 CPU，Q4 权重约 **2.15 GB**，可能需要额外下载另一份权重。

> **本地模型：下载与加载是两件事。**
>
> **下载**：首次使用需要下载模型文件，耗时取决于网速；文件缓存保留时无需重新下载。
>
> **加载**：每次执行新的 `soyori run` 命令，都会启动新进程并重新加载本地模型，可能需要等待几分钟。同一次流程运行中的多次模型调用会复用已加载的模型。

想直接使用默认本地模型，可以跳到第 3 步。想使用 OpenAI 或兼容服务，在当前 PowerShell 窗口设置：

```powershell
$env:LLM_PROVIDER = "auto"
$env:OPENAI_API_KEY = "替换为你的 API Key"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"
$env:OPENAI_MODEL = "替换为服务支持的模型 ID"
```

兼容服务需同时替换 Base URL。已有配置无需重复设置；这些命令仅影响当前窗口启动的进程，浏览器设置不会自动传给 CLI。

## 3. 新建流程文件

在当前文件夹新建 `translate.yaml`，先填写：

```yaml
schemaVersion: 1
name: 单轮翻译助手
description: 输入一句中文，翻译成英文。每次运行独立，不保存对话记忆。
```

`schemaVersion` 是流程格式版本，`name` 是流程名称，`description` 是可选说明。接下来继续在同一个文件末尾添加内容；完成第 6 步后再运行。

> **注意 YAML 缩进**：使用空格，不使用 Tab。下面的代码块已包含所需缩进；`fields`、`steps` 与 `schemaVersion` 顶格对齐。

## 4. 创建三个字段

在文件末尾添加：

```yaml
fields:
  chatIn:
    input: true
    initial: 今天的天气很好。
  prompt: {}
  chatOut:
    output: true
```

- `chatIn`：用户输入。`input: true` 允许从命令传入，`initial` 提供默认原文。
- `prompt`：内部中间值，由文本模板生成，不需要默认值。
- `chatOut`：模型回复。`output: true` 让 CLI 将它放进结果。

## 5. 拼合提示词

继续在文件末尾添加第一个步骤：

```yaml
steps:
  - type: template
    template: |-
      把下面的中文翻译成英文，只返回译文：
      $chatIn$
    output: $prompt
```

`template` 把翻译要求和原文拼成一段文字。`|-` 表示多行文本，`$chatIn$` 会替换为原文，`output: $prompt` 将完整提示词保存到 `prompt`。

## 6. 调用模型

在上一个步骤后面添加第二个步骤。它与 `- type: template` 对齐，**不要再次写 `steps:`**：

```yaml
  - type: call
    target: llm.auto
    inputs:
      input: $prompt
    outputs:
      result: $chatOut
```

`input: $prompt` 读取上一步的提示词；`result: $chatOut` 将模型回复保存到输出字段。模型连接参数省略时使用已有配置或默认本地模型。

> **注意引用写法**：文本模板中的 `$chatIn$` 前后都有 `$`；读取整个字段的 `$prompt` 只在开头有 `$`。

保存文件。完整 YAML 在本页末尾，可用于核对。

## 7. 运行并查看结果

```powershell
soyori run ./translate.yaml --set-string "chatIn=今天的天气很好。" --timeout 10m --json
```

`--set-string` 传入文字，`--json` 输出 JSON，`--timeout 10m` 将整个运行的时限设为 10 分钟，给本地模型加载留出时间。

> **请等待本地模型加载完成。** 每次新的 CLI 运行都需要加载模型，可能需要几分钟；首次还需下载文件，下载耗时取决于网速。下载、加载和生成共用上述超时。

成功后输出类似：

```json
{"version":1,"ok":true,"result":{"chatOut":"The weather is very nice today."}}
```

模型措辞可能不同。下载和设备选择提示另外显示，不属于结果 JSON。只有标记为输出的 `chatOut` 会出现在最终结果中。

## 8. 修改后再运行

在 `translate.yaml` 的文本模板中，将“英文”改为“日文”：

```yaml
    template: |-
      把下面的中文翻译成日文，只返回译文：
      $chatIn$
```

保存文件，再执行第 7 步的命令。`chatOut` 应为日文，例如 `今日はとてもいい天気です。`；模型调用步骤不需要改动。

也可以只修改命令中的输入，翻译另一句话：

```powershell
soyori run ./translate.yaml --set-string "chatIn=很高兴认识你。" --timeout 10m --json
```

## 9. 查看中间值（可选）

想检查生成的 `prompt`，可以记录每一步的字段：

```powershell
soyori run ./translate.yaml --set-string "chatIn=今天的天气很好。" --timeout 10m --trace translate-run-001.jsonl --trace-values --json
```

打开 `translate-run-001.jsonl`，查看文本模板步骤（`steps[0]`）后的字段记录，其中包含 `prompt`。这是运行记录，不是可以继续执行的存档。

> **trace 使用新文件名**：再次记录时改为 `translate-run-002.jsonl`，已有文件不会被覆盖。`--trace-values` 会记录输入等运行数据。

你已完成“创建字段 → 拼合提示词 → 调用模型 → 修改流程”。运行失败时查看错误信息，检查 YAML 缩进、模型配置和网络；完整参数见 [CLI 使用](cli/guide.md)。

## 完整 YAML

以下是第 3–6 步组合后的英文翻译流程：

```yaml
schemaVersion: 1
name: 单轮翻译助手
description: 输入一句中文，翻译成英文。每次运行独立，不保存对话记忆。
fields:
  chatIn:
    input: true
    initial: 今天的天气很好。
  prompt: {}
  chatOut:
    output: true
steps:
  - type: template
    template: |-
      把下面的中文翻译成英文，只返回译文：
      $chatIn$
    output: $prompt
  - type: call
    target: llm.auto
    inputs:
      input: $prompt
    outputs:
      result: $chatOut
```
