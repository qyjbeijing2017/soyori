# 工具完整参考

以下工具可从流程 call 节点使用。表中带 ? 的参数可省略，其他参数按各工具要求提供。模型可以使用的工具还受本次 tools 列表、作用域和预算限制。Editor 专属工程工具另见 [助手工具](assistant.md)。

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

统一返回 `{result, finishReason, usage, toolCalls, message}`。文本模式 result 是文字；远程 JSON 模式 result 是 JSON 值。不要读取旧 text/content 返回字段。详细默认值、消息和配置见 [模型与 Agent](../agents/models.md)。

## 工具批量执行

`tools.execute({calls, tools?})` 接收 `[{id,target,inputs}]`，inputs 必须是字面 JSON 输入对象，不再次解释 `$`。tools 省略不额外限制，显式空数组禁止全部目标；只能调用当前作用域中有定义的函数或导入流程。

返回 `{results}`，每项包含请求 id、target、ok，成功 value 或失败 error。单个普通工具失败作为结果返回，不自动停止整个批次；模型调用失败和预算耗尽等按执行器规则终止。它不返回 messages，转换由 memory.addTools 完成。

共享预算每次运行最多 64 次模型调用、64 次工具调用，批次最多 32 请求，工具子流程最多 2000 步，工具执行嵌套最多 8 层。不要把默认开放理解为无限制。

## 脚本

`script.run({code, input?})` 返回 result(value) 设置的整体 JSON 值，不额外包一层 result 属性。与数学工具 `{result}` 的返回结构不同。完整示例、模块和生命周期见 [脚本开发](../scripts/development.md)。
