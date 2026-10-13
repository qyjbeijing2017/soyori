# 环境变量与敏感值

环境变量保存流程运行所需的配置，例如搜索服务地址和 API Key。它们由用户配置，不写进分发的流程文件。

## 设置环境

网页在“设置 → 全局环境变量”填写默认配置。新增、编辑及删除后自动保存，无需再次点击保存。在对话页面点击顶栏右上角的环境图标，为当前 thread 填写覆盖值。新对话也可以提前配置；首次发送消息后才创建 thread 并保存这些值，未发送的新对话配置只在内存中保留。

同名变量按 **当前 thread > 全局** 选择，空字符串也是有效覆盖值。删除 thread 中的一项后，恢复使用全局值。每次开始运行时等待环境写入完成并取得快照，界面设置的中途修改只对下次运行生效；流程内 env.override/env.load 的临时覆盖影响后续调用。

主流程、导入子流程及 tools.execute 调用的工具共用这次运行的环境。由对话中的 flow.run 启动的流程继承该对话的环境。

## 当前文件的测试环境

Editor 顶栏右上角也有环境图标，用于设置当前文件的测试配置。同名变量按 **当前文件测试环境 > 全局** 选择，仅在该文件的 Editor 运行测试和单步测试中生效，子流程继承这次测试环境，不读取各自文件的测试配置。对话及从对话启动的 flow.run 不读取文件测试环境。

配置按浏览器文件 ID 保存于本地，文件重命名或移动不丢失；复制文件产生新 ID，不自动复制测试配置。它不写入流程文件，也不随工程包导出。

环境变量名使用字母、数字和下划线，不能以数字开头；值是字符串，区分大小写。每个作用域最多 200 项，单值最多 65536 个 UTF-16 单元。保留名 __proto__、constructor、prototype 不允许使用。

## 在流程中读取

`env.get({name})` 返回 `{found, value}`；未设置时 found 为 false、value 为 null，已设置的空字符串返回 found 为 true。它读取宿主准备的运行环境：网页配置或 CLI 合并后的配置，以及当前运行内的覆盖。

```yaml
schemaVersion: 1
name: 环境示例
fields:
  - name: apiKey
    sensitive: true
steps:
  - type: call
    target: env.get
    inputs:
      name: SEARCH_API_KEY
    outputs:
      value: $apiKey
```

后续工具调用可用 `$apiKey` 传入凭证。工具获得的是原值，不是遮挡文本。子流程继承本次运行环境，CLI 不使用 threadId 选择环境。

## 标记敏感值

环境设置中勾选“敏感值”，输入框默认遮挡，可主动显示；它不改变值。流程变量在变量设置中也有独立的“敏感值”开关，对应字段属性 `sensitive: true`。

- Editor 变量及默认值默认遮挡，点击右侧眼睛可查看和修改。显示后，眼睛前显示 30 秒倒计时，到时自动隐藏，再点眼睛可以立即隐藏。API Key 和环境敏感值使用相同控件。
- Editor 和对话的变量快照、CLI trace-values 隐藏明确标记的字段。CLI 标记敏感的输出字段以 `[sensitive]` 显示，对话中的敏感 chatOut 同样显示占位符；Core 返回原值。
- 对话执行记录不展示 env.get 的返回值；运行栈有敏感字段时，工具输入输出详情整体隐藏。敏感调用的错误详情可能隐藏，错误位置和代码仍保留。
- 文件库下载有效流程和工程包时移除敏感字段的 initial，保留字段及 sensitive 标记，原始文件不修改。环境配置不进入文件库导出。

**不自动传播敏感性。** env.get 读出的值不会自动标记目标变量；赋值、文本拼接、脚本和子流程返回也不会继承标记。需要隐藏的目标字段由用户明确标记。未经标记的派生值、模型回复、工具自写日志和直接读取源码可能包含原值。

敏感标记不加密、不阻止模型或第三方代码接收数据，不是权限隔离。不要把凭证作为模型输入。环境保存在当前浏览器的独立 IndexedDB 数据库 agent-plan-environment；CLI 保存在存储目录下 .environment，均为本地明文配置。两端不会自动同步。

## LLM 自动读取连接配置

`llm.openai` 和 `llm.anthropic` 的 `model`、`apiKey`、`baseURL` 分别按以下顺序取值：**步骤输入参数 > 当前有效环境 > 宿主连接默认值 > 内置默认值**。`$变量` 引用解析后的值也是步骤参数。省略、null、空字符串或纯空白视为未填写；其他错误类型仍报错。

| 参数 | OpenAI 兼容工具 | Anthropic 工具 |
| --- | --- | --- |
| model | OPENAI_MODEL | ANTHROPIC_MODEL |
| apiKey | OPENAI_API_KEY | ANTHROPIC_API_KEY |
| baseURL | OPENAI_BASE_URL | ANTHROPIC_BASE_URL |

有效环境沿用对话或文件覆盖全局的规则。网页宿主默认值来自设置中的对应连接；CLI 没有网页连接设置，读取 --env 临时值、系统环境和 env set 保存的全局配置，不根据 threadId 切换环境。内置默认值仅提供官方 Base URL；模型与密钥均未配置时明确报错，不猜模型。空环境覆盖项会屏蔽同名全局值，再回退到连接默认值。

例如，将 OPENAI_MODEL、OPENAI_API_KEY、OPENAI_BASE_URL 配置成兼容服务的模型、密钥和地址后，步骤只需填写 `target: llm.openai` 与 `inputs: { input: "你好" }`。密钥由宿主直接用于请求，不需要先通过 env.get 写入流程变量；也不会自动出现在模型提示、工具接口或返回结果中。

## 自动选择模型工具

`llm.auto` 与其他 LLM 工具使用相同的输入输出，步骤可以只填写 `inputs: { input: "你好" }`。选择顺序是：有效环境中的 `LLM_PROVIDER` > 网页设置中的供应商选择。可选值为 `auto`、`openai`、`anthropic`、`local`；空白环境值使用设置，CLI 未指定时默认 auto。

`auto` 模式按 OpenAI → Anthropic → 本地的顺序选择，远程工具必须在连接回退后同时具有非空的 model 和 apiKey。OpenAI 兼容服务（例如 DeepSeek）也由 OpenAI 工具处理。明确选择远程供应商后，缺配置会报错；请求失败不会切换供应商重试。无完整远程配置时使用本地，本地仍遵守下载许可、设备支持和模型加载条件。

连接参数仍按前述规则逐项读取。未填写 maxTokens 时，远程默认 4096、本地默认 512；本地不支持 outputFormat/jsonSchema，显式填写这些参数会报错。网页内置助手在设置为 auto 时也通过 llm.auto 选择，环境配置会参与选择；工具本身不会保存对话或自动运行工具循环。

## 助手环境工具

助手通过以下独立工具管理环境，不直接调用返回原值的 `env.get`：

- `env.list`：列出当前有效环境的名称、来源及状态。
- `env.inspect`：输入 `name`，查询某个变量。
- `env.set`：输入 `name`、字符串 `value`，可选布尔 `sensitive`，只保存到当前对话。新变量默认敏感，已有敏感变量不能通过助手取消敏感标记。

查询状态为 `missing`（未设置）、`empty`（空字符串）、`set`（已设置）。敏感项不返回 `value`；普通项返回值。助手不能指定其他对话或写全局、文件测试环境。敏感设置参数在对话执行记录中隐藏。用户直接在消息中输入的凭证仍会进入对话，请优先在环境设置表单中填写。

助手可以修改文件，通过 `flow.inspect` 校验、`flow.run` 测试已保存流程，不需要操作编辑器。每次测试读取发起对话的最新环境，因此同一轮设置后可以立即测试；编辑器发起的测试继承当前文件环境。流程执行仍可通过 `env.get` 使用真实值，标记为 `sensitive: true` 的输出和错误详情在返回助手时遮挡；模型调用导入子流程作为工具时也隐藏标记输出和敏感默认值。

这些限制防止通常的误回传，不是代码隔离：助手能编写代码，敏感性不会自动传播，未经标记的派生输出仍可能暴露原值。

## CLI 设置环境

启动优先级：**--env 临时覆盖 > 操作系统环境 > Soyori 全局配置**。启动后 env.override/env.load 可进一步覆盖本次运行；LLM 的步骤参数仍优先于运行环境。CLI 不区分 chat/非 chat，threadId 只是普通流程输入，不选择环境；已移除 --thread-id。网页仍保留对话/文件作用域。

```powershell
pnpm cli env set OPENAI_API_KEY demo-global --sensitive
pnpm cli env set OPENAI_MODEL deepseek-chat
$env:OPENAI_BASE_URL = "https://api.deepseek.com"
pnpm cli run flow.yaml --env LLM_PROVIDER=openai --env OPENAI_MODEL=deepseek-chat --json
pnpm cli env list --json
pnpm cli env delete OPENAI_API_KEY
```

--env 可重复，值始终是字符串，只在第一个等号处分割；同名最后一项生效，NAME= 表示空字符串，不恢复下层值。CLI 不自动加载配置文件，未增加 --env-file。env set/delete 只修改持久全局配置，env list 展示有效环境及来源 system/global、empty/set 状态；系统环境值默认敏感并遮挡。系统环境不会自动保存到全局配置。管理和运行命令支持 --storage-dir，应使用同一目录。

## 流程内临时覆盖与文件加载

- env.override 输入 name、字符串 value、可选 sensitive；新值默认敏感，不能降级已有敏感项。仅改变当前运行，后续工具、LLM 和子流程能读取，不写回全局、对话或文件测试设置。
- env.load 输入 path，读取 JSON 配置并一次性覆盖；缺文件、格式错误、超限时报错且不部分修改。返回 success 与 names，不返回配置值。

约定 JSON 格式：

```json
{
  "OPENAI_API_KEY": "demo-key",
  "OPENAI_MODEL": { "value": "deepseek-chat", "sensitive": false }
}
```

字符串简写默认敏感；元数据形式包含字符串 value 与布尔 sensitive。文件上限 2 MiB，变量名和数量沿用环境校验。其他格式可由 script.run 解析后逐项调用 env.override。

CLI 相对路径基于当前调用流程文件，子流程使用自己的目录；支持本地路径，不允许远端流程读取电脑配置。网页按调用流程在 Library 中的路径读取，禁止远端/其他协议加载。工具不改调用已开始的请求，也不提供跨运行持久化。原值 env.get/override/load 是流程执行工具，不直接开放给网页助手模型；助手持久配置仍用 env.set。
