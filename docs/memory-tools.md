# 消息组装与默认对话流程

agent-plan-ai 提供 createMemoryTools() 与 MEMORY_TOOL_DEFINITIONS，CLI 和 Editor 注册同名工具。记忆直接是通用消息数组。

| 工具 | 输入 | 输出 |
| --- | --- | --- |
| memory.init | threadId、prefix=memory、可选 system/prompt | 读取历史、替换 system、追加 user 后的 memory |
| memory.save | threadId、prefix=memory、memory | 保存消息数组，无输出字段 |
| memory.setSystem | messages、text 系统提示 | 替换所有已有 system 消息，最前面只保留一条 |
| memory.addUser | messages、input 用户文本 | 追加 user 消息后的 messages |
| memory.addAssistant | messages、message（LLM 输出） | 追加 assistant 消息后的 messages |
| memory.addTools | messages、results（tools.execute 输出） | 追加 tool 消息后的 messages |

messages 省略或为 null 时从空数组开始。工具返回新数组，不修改输入，保留 system 消息、模型内容块及工具请求。用户 input 必须非空，模型 message 必须为 assistant 消息。

setSystem 的 text 必须是非空文本，原文保留；每次删除已有 system 消息并在最前面设置一条，其他消息顺序不变。工具只组装当前 messages，不设置应用全局配置，也不负责存储。可以在 storage.read 后、memory.addUser 前调用，每轮替换系统提示；它不追加对话消息，因此允许在合法的待执行工具请求上下文中设置系统提示。

```yaml
- type: call
  target: memory.setSystem
  inputs:
    messages: $messages
    text: |
      你是 Agent Plan 的本地助手。
      使用中文回答，不编造工具执行结果。
  outputs:
    messages: $messages
```

addTools 按调用 ID 和 target 校验，要求每个尚未完成的请求恰有一个结果，按请求顺序加入消息。成功结果的 content 是结果的 JSON 文本，失败是 {error: {message}} 的 JSON 文本，toolCallId 保留请求 ID。未完成请求时不能追加用户或模型消息；孤立、缺失、重复及错配结果明确报错。空请求与空结果是无操作。

模型保留 result、toolCalls、message，tools.execute 只返回 results。消息转换与拼接集中在 memory 工具。createMemoryTools(storage) 注入与通用存储工具相同的后端；无 storage 时消息组装仍可用，init/save 明确报 MEMORY_STORAGE。

memory.init/save 的 key 为 prefix/threadId，prefix 默认 memory，允许空字符串或末尾一个 /；threadId 必须为单个合法 key 片段，组合后仍受通用存储 key 限制。init 缺失历史时从空数组开始，存在但损坏的历史明确报错；省略 system 保留已有提示，提供时替换旧 system，省略 prompt 不追加用户消息，提供的 system/prompt 必须非空。init 不写存储。save 只接受消息数组，并要求所有工具请求已有结果；沿用存储 JSON 校验及错误。两者不做摘要压缩、不维护隐藏记忆。

## 默认流程

五个外层步骤：memory.init → llm.local → memory.addAssistant → 工具循环 → memory.save。工具循环执行 tools.execute → memory.addTools → llm.local → memory.addAssistant，直到 toolCalls 为空。

系统提示在 memory.init 的 system 参数中编辑，每轮放在消息最前面并替换旧提示，不重复累积。默认提示仅保留语言、按需调用工具和诚实回答等通用要求，具体查询接口放在工具定义中。模型 tools 参数内联 time.now/web.search/web.fetch，两处调用均可编辑。工具请求直接读取 assistantMessage.toolCalls。

接口变量 chatIn/threadId/chatOut；内部 messages/assistantMessage/toolResults。记忆保存于 memory/<threadId>，Chat 原始记录仍在 threads/<threadId>；已有用户流程保持原样，不迁移旧 threads/<threadId>/messages。模型失败不覆盖旧记忆，回复上限 512 token。

不做摘要、压缩或自动裁剪；超出模型上下文限制会报错。默认工具循环是普通 while，可编辑并逐步调试；共享模型及工具调用预算防止无界执行。普通工具失败作为消息交给模型，模型调用失败或预算耗尽不保存本轮上下文。旧 memory.read/append/context/compact 不再注册，不迁移旧记忆或覆盖用户流程。并发写同一 key 沿用 storage.write 覆盖语义。

完整示例：[JSON](../examples/memory-chat.json)、[YAML](../examples/memory-chat.yaml)。
