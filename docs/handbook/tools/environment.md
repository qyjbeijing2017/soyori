# 运行环境

本章逐个说明当前工具。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

## 使用前先了解

- **值是文字**：环境值必须是字符串，例如模型名或服务地址。命名方式和配置范围见[环境变量](../agents/environment.md)。最多 200 项，单值最多 65536 个 UTF-16 文本单位。
- **临时修改**：env.override 和 env.load 只影响当前运行的后续步骤，不保存到用户设置。新值默认敏感，不能取消已有敏感标记。
- **加载文件**：env.load 读取约定的 JSON 配置，最多 2 MiB；格式或大小不合要求时整体失败，不会只改一部分。格式见[环境配置文件](../agents/environment.md#流程内临时覆盖与文件加载)。
- **助手查询**：env.get / override / load 给流程执行使用；网页助手查询和修改当前对话配置时使用本页末尾的 env.list / inspect / set。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## env.get

读取本次运行的环境原值，found 区分缺失与空字符串。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| name | string | 必填 | 要查询或设置的准确名称 |

返回：{found, value}；缺失 value 为 null。

命名输出属性：`found`、`value`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: env.get
  inputs:
    name: OPENAI_MODEL
  output: $answer
```

## env.override

仅覆盖本次运行，后续调用与子流程可见，不持久写入用户设置。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| name | string | 必填 | 要查询或设置的准确名称 |
| value | string | 必填 | 本次运行要使用的字符串值，例如 local |
| sensitive | boolean | 可选 | 是否遮挡显示，不改变运行原值 |

返回：{success: true, names: ["LLM_PROVIDER"]}。

使用 output 保存完整返回值，不要假设它额外包了一层 result。

```yaml
- type: call
  target: env.override
  inputs:
    name: LLM_PROVIDER
    value: local
    sensitive: false
  output: $answer
```

## env.load

按调用流程相对路径读取约定 JSON 并一次性覆盖本次运行环境。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| path | string | 必填 | JSON 配置文件路径；例如 ./environment.json 表示调用流程同一目录下的文件 |

返回：{success: true, names: 已加载名称列表}，不返回配置原值。

使用 output 保存完整返回值，不要假设它额外包了一层 result。

```yaml
- type: call
  target: env.load
  inputs:
    path: ./environment.json
  output: $answer
```


## 助手专属：env.list

列出当前对话有效环境的名称、来源与 missing/empty/set 状态。无输入参数，返回 `{variables: [...]}`；每项含 name、found、status，以及存在时的 source/sensitive。敏感项不返回 value，普通项可返回文字值。适合先查是否配置齐全。

助手工具请求示例：

```json
{"target":"env.list","inputs":{}}
```

## 助手专属：env.inspect

输入必填 name，查询一个环境项的有效来源与状态。返回 `{name, found, status, source?, sensitive?, value?}`；敏感值只显示状态，不能用它取 API Key 原值。

```json
{"target":"env.inspect","inputs":{"name":"OPENAI_MODEL"}}
```

## 助手专属：env.set

输入必填 name、字符串 value，可选 sensitive。只保存到当前对话，不写全局或文件测试配置，返回 success 和设置后的名称、来源、状态。新字段默认敏感，不能通过助手取消已有敏感标记；普通配置可在新建时明确 sensitive=false。

```json
{"target":"env.set","inputs":{"name":"OPENAI_MODEL","value":"your-model-id","sensitive":false}}
```

这三个接口给网页助手使用，不是 CLI 工具，也不作为普通 call 选择器中的运行环境工具。配置表单与运行原理见[环境变量](../agents/environment.md)。不要把凭证写进聊天消息来配置。
