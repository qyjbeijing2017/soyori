# 工具完整参考

工具负责完成一件具体的事，例如去掉文字空白、查询时间、读取数据或调用模型。流程通过“调用”步骤使用工具；工具名称是固定的，例如 `text.trim`。

以下是流程可用工具的查阅入口。Editor 助手专属工具另外标注，见[助手工具](assistant.md)。不熟悉工具时，先按下面的方法试用一个简单工具。

## 如何阅读工具说明

每个工具的说明包含**用途、输入参数、返回内容和调用示例**：

1. **输入参数**是你交给工具的内容。标为“必填”的要填写；“可选”可以省略，有默认值时会使用默认值。
2. **返回内容**是工具做完后交回的数据。它可能是一段文字，也可能包含多个有名字的结果。
3. **步骤片段**只展示这一个调用，不能直接保存成独立流程。应放进完整流程的 `steps` 下。

例如，`math.abs` 把 -3 变成 3。下面是可以独立运行的完整流程：

```yaml
schemaVersion: 1
name: 试用绝对值工具
fields:
  answer:
    output: true
steps:
  - type: call
    target: math.abs
    inputs:
      value: -3
    outputs:
      result: $answer
```

运行后得到 `{answer: 3}`。在 Editor 中，先添加 answer 字段并勾选“输出”，再添加“调用”步骤、选择 math.abs、将 value 填为 -3，并把输出 result 保存到 answer。

**注意保存方式**：math.abs 实际返回 `{result: 3}`。上例的 `outputs` 只取其中的 result，所以 answer 是数字 3。各工具页多数使用 `output: $answer` 保存整个返回值，此时 answer 是 `{result: 3}`。详见[调用步骤](../flows/calling.md#只保存结果-还是保存整个返回对象)。

参数表中的常用类型：`string` 是文字，`number` 是数字，`integer` 是整数，`boolean` 是 true / false，`object` 是对象，`[]` 表示列表（例如 `string[]` 是文字列表）。`JSON` 可包含文字、数字、布尔值、null、对象和列表。遇到类型时可以按[字段类型](../flows/types.md)查阅，不需要先记住这些名字。

表中带 `?` 的参数可省略。模型能请求哪些工具，还受你提供的 tools 列表和运行限制约束，入门时可以先直接通过“调用”步骤使用工具。

## 按能力查阅完整说明

| 分类 | 内容 |
| --- | --- |
| [数学、文本与列表](basic.md) | 每个基础工具的参数、返回和调用示例 |
| [时间与网络](web.md) | 时区、HTTP 请求与搜索 |
| [存储与 token](storage.md) | JSON key 存储、实际计数和估算 |
| [记忆编排](memory.md) | 初始化、消息追加、工具结果和保存 |
| [模型调用](models.md) | auto、OpenAI 兼容、Anthropic、本地 |
| [运行环境](environment.md) | 原值读取、临时覆盖、文件加载与助手查询 |
| [执行与脚本](execution.md) | 工具请求执行、JavaScript 模块返回 |
| [助手工具](assistant.md) | 文档、接口发现、文件管理和已保存流程测试 |

下方是快速查表，具体使用与错误边界以各分类章节为准。

## 数学 文本 数组

这组工具都返回 `{result}`，使用 `outputs: {result: "$value"}`。数字要求有限 number，不沿用数学节点的宽松数字转换。

| 名称 | 输入 | 结果 |
| --- | --- | --- |
| math.abs/floor/ceil/round | value | 绝对值、向下/向上/四舍五入，遵循 JS Math |
| math.min/max | values | 非空数字数组的极值 |
| math.clamp | value、min、max | 限制区间，要求 min ≤ max |
| math.random | min?=0、max?=1 | [min,max) 随机小数，非密码学随机 |
| text.trim | text | 移除两端空白 |
| text.split | text、separator | 字面分割；空分隔符按 UTF-16 单元 |
| text.replace | text、search、replacement | 替换所有字面匹配，search 非空，不用正则 |
| array.concat | arrays | 多个数组合并一层 |
| array.slice | array、start?=0、end? | end 不包含，负索引从末尾 |
| array.length | array | 元素数量 |

文本最多 100000 UTF-16 单元，数组最多 100000 项，结果扩展也受限制。非法输入报 BASIC_INPUT，扩展超限报 BASIC_LIMIT。

## 日期与时间

`time.now({timeZone?})` 返回 `{timestamp, iso, timeZone, date, time, weekday}`。timestamp 为 Unix 毫秒，iso 始终 UTC，date/time 属于返回的 timeZone，time 是 24 小时制，weekday 周一 1 至周日 7。

未指定时区使用宿主时区，不自动选择 UTC。用户明确指定时才传入合法 IANA 名称，无效时区失败。

## 网络

`web.fetch({url, method?, headers?, body?, timeoutMs?})` 接受 HTTP(S)，默认 GET。GET/HEAD 不携带 body，不支持 CONNECT/TRACE/TRACK。headers 是字符串值对象；字符串 body 原样发送，JSON body 序列化并在缺失时设置 application/json。

返回 `{url, status, headers, body}`，url 是重定向最终地址。JSON 响应解析成数据，文本/XML 返回字符串，HEAD/204 等空响应为 null。HTTP 4xx/5xx 正常返回，流程检查 status；网络故障才抛错。HTML 不执行脚本，不提取正文。

timeoutMs 默认 10000，范围 1–60000；请求体和解压后响应分别最多 2 MiB。字符集读取响应头，默认 UTF-8。网络、超时、取消、大小、类型、编码和坏 JSON 分别使用 WEB_NETWORK/TIMEOUT/CANCELLED/SIZE/TYPE/ENCODING/JSON。浏览器无法自行绕过 CORS。

`web.search({query, limit?=3})` 返回 `{results: [{title,url,snippet}]}`。query 最多 500 字符，limit 1–5，使用 Mwmbl 公共搜索。结果不是全文，时效不保证；空数组表示未找到，不是执行失败。

## 存储与 token

`env.get({name})` 读取本次运行环境，配置来源由网页对话、Editor 文件测试或 CLI 入口决定，返回 `{found, value}`。未设置时 value 为 null，不自动传播敏感标记。配置方式和边界见 [环境与敏感值](../agents/environment.md)。

| 名称 | 输入 | 返回 |
| --- | --- | --- |
| storage.read | key | found、value，缺失 value 为 null |
| storage.write | key、value | key，完整替换 |
| storage.delete | key | deleted，缺失 false |
| storage.list | prefix? | keys，排序后的字面前缀匹配 |
| tokens.count | input、mode? | tokens、method、model |

storage 只接受 JSON。tokens.count 的 mode 默认 local，使用当前本地 tokenizer；estimate 为无需下载的估算，两者不能混同。key 规则与平台位置见 [存储](../agents/storage.md)。

## 记忆编排

| 名称 | 输入 | 返回 |
| --- | --- | --- |
| memory.init | threadId、prefix?=memory、system?、prompt? | memory |
| memory.save | threadId、memory、prefix?=memory | 无命名输出 |
| memory.setSystem | messages?、text | messages |
| memory.addUser | messages?、input | messages |
| memory.addAssistant | messages?、message | messages |
| memory.addTools | messages?、results | messages |

组装返回新数组，不修改输入。save 要求工具请求已有完整结果；init 读取但不保存。system/text/prompt/user input 提供时须是非空文字。详见 [存储与记忆](../agents/storage.md)。

## 模型

`llm.openai`、`llm.anthropic`、`llm.local` 接收 input（文字或完整消息数组）、model、apiKey、baseURL、maxTokens、temperature、tools；远程还支持 outputFormat 和 jsonSchema。本地不接受远程格式参数，model 仅支持当前固定模型。

远程连接参数支持逐项回退：步骤参数 > 当前有效环境 > 宿主连接默认值 > 官方 Base URL。环境名与空值规则见[环境与敏感值](../agents/environment.md#llm-自动读取连接配置)；模型与密钥没有内置默认值。

`llm.auto` 使用相同输入输出，按 LLM_PROVIDER 和设置选择供应商；auto 时优先完整的 OpenAI 配置，再 Anthropic，最后本地。详见[自动选择](../agents/environment.md#自动选择模型工具)。

统一返回 `{result, finishReason, usage, toolCalls, message}`。文本模式 result 是文字；远程 JSON 模式 result 是 JSON 值。不要读取旧 text/content 返回字段。详细默认值、消息和配置见 [模型与 Agent](../agents/models.md)。

## 工具批量执行

`tools.execute({calls, tools?})` 接收 `[{id,target,inputs}]`，inputs 必须是字面 JSON 输入对象，不再次解释 `$`。tools 省略不额外限制，显式空数组禁止全部目标；只能调用当前作用域中有定义的函数或导入流程。

返回 `{results}`，每项包含请求 id、target、ok，成功 value 或失败 error。单个普通工具失败作为结果返回，不自动停止整个批次；模型调用失败和预算耗尽等按执行器规则终止。它不返回 messages，转换由 memory.addTools 完成。

共享预算每次运行最多 64 次模型调用、64 次工具调用，批次最多 32 请求，工具子流程最多 2000 步，工具执行嵌套最多 8 层。不要把默认开放理解为无限制。

## 脚本

`script.run({code, input?})` 返回 result(value) 设置的整体 JSON 值，不额外包一层 result 属性。与数学工具 `{result}` 的返回结构不同。完整示例、模块和生命周期见 [脚本开发](../scripts/development.md)。
