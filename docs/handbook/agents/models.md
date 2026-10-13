# 模型与 Agent 工具循环

模型工具负责一次调用，Agent 行为由普通步骤和 while 循环组合。更换供应商无需改 Core；配置助手的模型与修改用户流程的模型是不同操作。

## 配置网页助手

打开设置，选择助手模型连接。OpenAI 兼容服务填 apiKey、服务 baseURL 和服务实际支持的 model；DeepSeek 使用它的兼容接口配置，模型名称与服务地址以你的服务配置为准，不从名称猜测接口支持。

内置助手选择自动时使用 llm.auto；明确选择供应商时调用对应工具。新建聊天模板默认使用 llm.auto，完整消息上下文保存在 memory 运行变量中，内置助手的内部消息变量仍为 messages。llm.auto 优先读取有效环境 LLM_PROVIDER，再读取宿主设置；auto 依次使用 model/apiKey 配置完整的 OpenAI、Anthropic，否则本地。连接参数逐项按步骤参数 > 有效环境 > 设置中的连接 > 内置默认值解析。显式工具缺配置报错，失败不切换供应商重试。

浏览器直接请求服务，服务必须允许该站点跨域。网络错误不能直接认定为 CORS；同时检查地址、模型、凭据和响应状态。没有内置代理。将密钥直接写进流程会随文件导出，使用输入变量可避免保存为默认值。

## 单次模型调用

```yaml
- type: call
  target: llm.openai
  inputs:
    input: $prompt
    apiKey: $apiKey
    baseURL: $baseURL
    model: $model
  outputs:
    result: $answer
    message: $assistantMessage
```

CLI 的连接参数可以直接填入步骤或引用输入字段；省略时读取有效环境，优先级为 --env > 系统环境 > env set 全局配置。环境名称与空值规则见[环境与敏感值](environment.md)。远程 apiKey/model 最终缺失时报错；baseURL 省略使用官方默认地址，URL 必须是 HTTP(S)，不能含凭据、查询串和片段。不同兼容服务的路径按服务要求填写。

远程 maxTokens 默认 4096、范围 1–32768；本地默认和最多 512。temperature 可选 0–1，远程省略不发送，某些模型不接受此参数。本地输入加最大输出不能超过 2048 token。

远程 outputFormat 默认 text；json 模式必须有 jsonSchema 对象，不能与工具调用一起用。不完整、拒绝或坏 JSON 报错，不把残缺文本伪装成结构化输出。单次远程请求最多 120 秒，无自动重试，CLI 总超时可以更短。

## 消息与返回

input 是非空文字或非空消息数组。普通消息为 `{role: system|user|assistant, content: 文字}`；assistant 可带 toolCalls，tool 消息带 toolCallId，支持供应商内容块。不要自行把模型原始 tool_calls 当作通用接口。

返回 result、finishReason、usage、toolCalls、message。toolCalls 为 `[{id,target,inputs}]`，message 是可加入上下文的 assistant 消息。本地 finishReason/usage 为 null，远程 usage 取供应商。result 本身不表示工具已经执行。

## 显式工具循环

典型流程：memory.init → llm 调用 → memory.addAssistant → while 工具请求非空 → memory.save。循环内按顺序：

```yaml
- type: call
  target: tools.execute
  inputs:
    calls: $assistantMessage.toolCalls
  outputs:
    results: $toolResults
- type: call
  target: memory.addTools
  inputs:
    messages: $memory
    results: $toolResults
  outputs:
    messages: $memory
- type: call
  target: llm.openai
  inputs:
    input: $memory
    model: $model
    apiKey: $apiKey
    tools: [time.now]
  outputs:
    result: $chatOut
    message: $assistantMessage
- type: call
  target: memory.addAssistant
  inputs:
    messages: $memory
    message: $assistantMessage
  outputs:
    messages: $memory
```

这段是循环体片段，不是独立流程。首次模型调用也需提供同样的 tools。条件可使用 `$assistantMessage.toolCalls.length`。memory.addTools 负责把执行结果转成正确消息，不由 tools.execute 隐式拼接。

tools 名称可以包含当前作用域的带接口宿主工具和导入流程；不能调用未注册目标。模型选择工具与执行器限制共同约束行为。小模型工具列表应保持精简，并按需查接口。普通工具失败交给模型不保证它能够正确修复。

## 本地模型与资源

当前本地固定 Qwen3-1.7B-ONNX。浏览器需要允许下载以及 WebGPU/shader-f16，首次权重下载约 1.44 GB；进度包括缓存读取和初始化，不表示每次重复下载。成功后复用模型会话，停止或失败清理，不自动重试。

CLI 优先 Node WebGPU + Q4F16，初始化失败后回退 CPU + Q4，并使用文件缓存；设备选择提示写 stderr，生成失败不切换重试。首次下载、两次初始化及推理计入总超时，可按需要设置 --timeout 10m。新模型手机和 Node CPU 的具体表现仍需设备实测，不能根据浏览器成功承诺跨端性能。

对话记忆不自动裁剪或压缩，超过上下文限制会报错。完整存储规则见 [存储与记忆](storage.md)。
