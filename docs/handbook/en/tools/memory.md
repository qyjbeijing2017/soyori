# Memory orchestration

Memory is a message list prepared for AI, not permanent learning. Usual order: memory.init reads history and adds the question → call a model → memory.addAssistant appends the complete reply → memory.save persists it. For tool requests, also execute them and use memory.addTools. See [Agent flows](../agents/models.md).

## Before you start

Assembly tools return new lists without mutating the supplied one. Save returned memory back to your field. threadId and prefix determine the storage key; init only reads, save persists. Every tool request needs a matching result before the next model call or save. Text supplied must be nonempty. History is not automatically trimmed or compressed. MEMORY_INPUT means invalid messages; MEMORY_STORAGE means storage is unavailable.

Examples are step fragments for a complete flow with an answer field. These tools return {memory}, except save which needs no output mapping. See [output mappings](reference.md#how-to-read-tool-documentation).

## memory.init

Read saved history, optionally replace its system instruction and append the current user text. This example reads memory/demo without saving.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| threadId | string | Required | Valid single-segment conversation ID
| prefix | string | Optional, memory | Storage prefix
| system | string | Optional | New system instruction; omit to retain the old one
| prompt | string | Optional | Current user text |

Returns memory: the message array.

```yaml
- type: call
  target: memory.init
  inputs:
    threadId: demo
    system: Answer briefly.
    prompt: Hello
  output: $answer
```

## memory.save

Validate and save a complete message sequence for the next init. All tool requests must have their results. Do not set output mappings.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| threadId | string | Required | Conversation ID
| prefix | string | Optional, memory | Same prefix used when reading
| memory | JSON | Required | Complete message array |

Returns No named outputs; execution continues after saving.

```yaml
- type: call
  target: memory.save
  inputs:
    threadId: demo
    memory:
      - role: user
        content: Hello
      - role: assistant
        content: Hello!
```

## memory.setSystem

Remove existing system messages, prepend one new system message, and retain the other messages.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| memory | JSON | Optional | Existing history; absent or null starts an empty list
| text | string | Required | Nonempty system instruction |

Returns memory: a new message array.

```yaml
- type: call
  target: memory.setSystem
  inputs:
    memory: []
    text: Answer briefly.
  output: $answer
```

## memory.addUser

Append one user message.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| memory | JSON | Optional | Existing history; absent or null starts an empty list
| input | string | Required | Nonempty user text |

Returns memory: a new array including the user message.

```yaml
- type: call
  target: memory.addUser
  inputs:
    memory: []
    input: Hello
  output: $answer
```

## memory.addAssistant

Append the complete model message, including any tool requests. Pass the LLM return message, not just its result text.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| memory | JSON | Optional | Existing history; absent or null starts an empty list
| message | JSON | Required | Complete assistant message returned by the model |

Returns memory: a new array; the input array is unchanged.

```yaml
- type: call
  target: memory.addAssistant
  inputs:
    memory:
      - role: user
        content: Hello
    message:
      role: assistant
      content: Hello!
  output: $answer
```

## memory.addTools

Convert actual execution results into tool messages that complete pending requests. IDs and targets must match.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| memory | JSON | Optional | Existing history; absent or null starts an empty list
| results | JSON | Required | Execution results matching pending request id/target pairs |

Returns memory: a new array including tool results.

```yaml
- type: call
  target: memory.addTools
  inputs:
    memory:
      - role: user
        content: Find the absolute value.
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

In real loops, reference current memory and the results returned by tools.execute. The literal result above only illustrates the format; do not fabricate a successful tool result.
