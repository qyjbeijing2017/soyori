# 记忆编排

这里的“记忆”是准备交给 AI 的消息列表。它让模型在下一轮继续看到之前的内容，不是让模型永久学会这些信息。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

常用顺序是：`memory.init` 读取历史并加入本轮问题 → 调用模型 → `memory.addAssistant` 加入完整回复 → `memory.save` 保存。需要执行模型提出的工具请求时，再加入 `memory.addTools`。完整组合见[模型与 Agent 工具循环](../agents/models.md)。

## 使用前先了解

- **已有消息**：memory 是当前消息列表，包含用户问题、AI 回复和工具结果。组装工具返回新的列表，不直接修改传入列表；要继续使用，需将返回的 memory 保存回字段。
- **记忆位置**：threadId 是对话编号，prefix 默认 memory，共同决定保存名称。memory.init 只读取，memory.save 才保存。
- **工具请求**：AI 请求工具后，需要先执行所有请求，再用 memory.addTools 加入一一对应的结果，才能继续下一次模型调用或保存。
- **使用限制**：提供的文字不能为空。工具不会自动缩短或压缩消息历史；消息格式不合法报 MEMORY_INPUT，未配置存储报 MEMORY_STORAGE。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## memory.init

读取指定对话的消息历史，按需替换 system、追加本轮用户文字，返回流程记忆。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| threadId | string | 必填 | 合法单段对话 ID，用于定位记忆 key |
| prefix | string | 可选；默认 "memory" | 记忆存储位置的前缀；默认与 threadId 组成 memory/对话编号 |
| system | string | 可选 | 省略时保留已有系统提示。 |
| prompt | string | 可选 | 可选的本轮用户文本。 |

返回：{memory: 消息数组}；本例 threadId 为 demo，因此读取 memory/demo；此步骤不保存。

命名输出属性：`memory`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: memory.init
  inputs:
    threadId: demo
    system: 请简洁回答
    prompt: 你好
  output: $answer
```

## memory.save

校验完整消息序列并保存，供下一轮 memory.init 读取。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| threadId | string | 必填 | 合法单段对话 ID，用于定位记忆 key |
| prefix | string | 可选；默认 "memory" | 记忆存储位置的前缀；默认与 threadId 组成 memory/对话编号 |
| memory | JSON | 必填 | 完整消息数组，保存前必须完成所有工具请求 |

返回：无命名输出；保存成功后继续后续步骤。

不设置输出映射，保存后直接继续。

```yaml
- type: call
  target: memory.save
  inputs:
    threadId: demo
    memory:
      - role: user
        content: 你好
      - role: assistant
        content: 你好！
```

## memory.setSystem

移除旧 system 消息，在首位放一条新 system，保留其他消息。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| memory | JSON | 可选 | 已有上下文；未设置或 null 时从空数组开始。 |
| text | string | 必填 | 要处理的文字 |

返回：{memory: [{role: "system", content: "请简洁回答"}]}。

命名输出属性：`memory`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: memory.setSystem
  inputs:
    memory: []
    text: 请简洁回答
  output: $answer
```

## memory.addUser

向消息列表追加一条用户消息。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| memory | JSON | 可选 | 已有上下文；未设置或 null 时从空数组开始。 |
| input | string | 必填 | 要加入消息列表的本轮用户文字 |

返回：{memory: [{role: "user", content: "你好"}]}。

命名输出属性：`memory`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: memory.addUser
  inputs:
    memory: []
    input: 你好
  output: $answer
```

## memory.addAssistant

追加完整模型消息，包括它提出的工具请求。继续循环时使用 LLM 返回的 message。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| memory | JSON | 可选 | 已有上下文；未设置或 null 时从空数组开始。 |
| message | JSON | 必填 | 模型返回的完整 assistant 消息 |

返回：{memory: 新消息数组}，不修改输入数组。

命名输出属性：`memory`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: memory.addAssistant
  inputs:
    memory:
      - role: user
        content: 你好
    message:
      role: assistant
      content: 你好！
  output: $answer
```

## memory.addTools

把工具执行结果转换为工具消息，完成消息列表中待处理的请求。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| memory | JSON | 可选 | 已有上下文；未设置或 null 时从空数组开始。 |
| results | JSON | 必填 | 与待处理请求 id/target 匹配的执行结果列表 |

返回：{memory: 包含工具结果的新消息数组}。

命名输出属性：`memory`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: memory.addTools
  inputs:
    memory:
      - role: user
        content: 取绝对值
      - role: assistant
        content: ""
        toolCalls:
          - id: one
            target: math.abs
            inputs:
              value: -2
    results:
      - id: one
        target: math.abs
        result:
          result: 2
  output: $answer
```

实际循环中引用当前 memory 和 tools.execute 返回的 results，不要手工伪造工具成功。
