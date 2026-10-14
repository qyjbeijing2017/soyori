# 存储与 token

本章逐个说明当前工具。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

## 使用前先了解

- **存储名称**：key 就是一条数据的名字，例如 demo/settings。用同一个名字读取就能取回；写入同名数据会完整替换。
- **保存范围**：只保存 JSON 内容，不能保存未设置值、函数、循环引用或无限大数字。每段 key 最多 80 字符，总长最多 240；使用小写英文、数字、-、_、.，用 / 分组，不能包含空段、绝对路径或 Windows 保留名。
- **查找名称**：prefix 按开头文字匹配。demo 会匹配 demo-other；只找 demo 这一组时填 demo/。具体位置见[存储与对话记忆](../agents/storage.md)。
- **计数与估算**：tokens.count 的 local 需要准备分词器文件，但不加载模型权重；estimate 不下载文件，只估算。两者结果不能混为实际模型用量。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## tokens.count

token 是模型处理文字时使用的小单位，不等同于字数或汉字数。这个工具帮助了解一段文字或一组消息会占用多少空间，避免交给模型的内容过长。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| input | string \| messages[] | 必填 | 文本或消息数组；文本直接计数，消息数组包含聊天模板开销。 |
| mode | local \| estimate | 可选；默认 "local" | local 使用当前本地模型的分词器实际计数；estimate 不下载文件，只估算 |

返回：{tokens, method, model}；estimate 的 method 为 estimate、model 为 null；计数不能代表任意远程模型。

命名输出属性：`tokens`、`method`、`model`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: tokens.count
  inputs:
    input: 你好
    mode: estimate
  output: $answer
```

## storage.read

按 key 读取 JSON 数据，不存在与读取失败分别处理。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| key | string | 必填 | 存储键，可用 / 分组。 |

返回：存在：{found: true, value: 数据}；缺失：{found: false, value: null}。

命名输出属性：`found`、`value`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: storage.read
  inputs:
    key: demo/settings
  output: $answer
```

## storage.write

完整替换一个 key 的 JSON 数据，不自动合并对象。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| key | string | 必填 | 存储键，可用 / 分组。 |
| value | JSON | 必填 | 要保存的 JSON 内容，例如文字、数字、对象或列表 |

返回：{key: "demo/settings"}。

命名输出属性：`key`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: storage.write
  inputs:
    key: demo/settings
    value:
      language: zh
  output: $answer
```

## storage.delete

删除指定名称下保存的数据。没有这条数据时，返回 deleted 为 false。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| key | string | 必填 | 存储键，可用 / 分组。 |

返回：{deleted: true} 或缺失时 {deleted: false}。

命名输出属性：`deleted`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: storage.delete
  inputs:
    key: demo/temporary
  output: $answer
```

## storage.list

列出字面前缀匹配的 key，适合查找同组记录。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| prefix | string | 可选；默认 "" | 空字符串（列出全部） |

返回：{keys: 排序后的 key 列表}。

命名输出属性：`keys`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: storage.list
  inputs:
    prefix: demo/
  output: $answer
```
