# 时间与网络

本章逐个说明当前工具。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

## 使用前先了解

- **查询时间**：time.now 默认使用设备时区，无效时区报 TIME_INPUT。
- **请求网址**：web.fetch 默认使用 GET 读取，不填写 body；需要发送数据时按接口要求选择其他 method。默认等待最多 10 秒，可通过 timeoutMs 调整到 1–60000 毫秒。请求体和解压后响应各最多 2 MiB。
- **检查结果**：HTTP 状态 4xx / 5xx 也会正常返回，表示服务拒绝或处理失败，需要检查 status 和 body。连接失败、超时等才会使调用报错。
- **浏览器限制**：有些服务不允许网页直接访问，会受跨域规则（CORS）限制；不能靠修改流程绕过。网页请求不支持 CONNECT / TRACE / TRACK，GET / HEAD 不能带 body。
- **搜索资料**：web.search 的 query 最多 500 字符，limit 默认 3，可填 1–5。返回标题、链接和摘要，需要全文时再读取对应链接。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## time.now

读取当前日期和时间。默认使用运行设备的时区；需要其他地区的时间时，填写 timeZone，例如 Asia/Shanghai 表示上海时区。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| timeZone | string | 可选 | 仅在用户明确指定时区时填写 IANA 时区，例如 Asia/Shanghai 或 UTC；否则省略。 |

返回：timestamp 为 Unix 毫秒；iso 为 UTC；date/time 为返回时区的日期及 24 小时制时间；weekday 周一 1 至周日 7。

命名输出属性：`timestamp`、`iso`、`timeZone`、`date`、`time`、`weekday`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: time.now
  inputs: {}
  output: $answer
```

## web.fetch

访问一个网址，取得服务返回的数据或网页源码。适合请求天气等服务接口；它不会像浏览器那样执行网页脚本，也不会自动把 HTML 源码整理成文章正文。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| url | string | 必填 | HTTP(S) 地址 |
| method | string | 可选；默认 "GET" | HTTP 方法，省略为 GET |
| headers | JSON | 可选 | 请求头对象，值必须是字符串，例如 {"Content-Type": "application/json"}。浏览器受 CORS 和请求头限制。 |
| body | JSON | 可选 | 对象或数组自动编码为 JSON；字符串原样发送；未设置则不发送。 |
| timeoutMs | integer | 可选；默认 10000 | 请求超时毫秒数 |

返回：{url, status, headers, body}；url 是最终地址，HTML body 为文字，空响应为 null。

命名输出属性：`url`、`status`、`headers`、`body`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: web.fetch
  inputs:
    url: https://example.com
  output: $answer
```

## web.search

通过 Mwmbl 查找标题、链接和摘要，适合发现后续要读取的页面。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| query | string | 必填 | 搜索文字 |
| limit | integer | 可选；默认 3 | 最多返回几条搜索结果；填写 1–5 的整数 |

返回：{results: [{title, url, snippet}]}；无匹配为 []，时效不保证。

命名输出属性：`results`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: web.search
  inputs:
    query: Soyori
    limit: 3
  output: $answer
```
