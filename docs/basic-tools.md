# 通用基础工具

CLI 与 Editor 共用 soyori-tools，所有能力通过普通 call 节点提供，既可直接编排，也可提供给模型调用。web.search 支持 Mwmbl、Tavily 与博查，不搭建代理或自有搜索服务。

## 日期

`time.now({timeZone?})` 返回 timestamp（Unix 毫秒）、iso（UTC ISO 字符串）、timeZone、date（YYYY-MM-DD）、time（HH:mm:ss）、weekday（周一 1 至周日 7）。默认使用宿主时区：Editor 是浏览器设备时区，CLI 是运行机器时区。只有用户明确指定时区时才传入 Asia/Shanghai、UTC 等 IANA 时区；用户未指定时区时，模型应省略 timeZone，不自行选择 UTC。date/time 对应返回的 timeZone，time 为 24 小时制（08:56 是上午，20:56 是晚上）；iso 始终为 UTC，不与本地时间混用。无效时区报错。

## 网页读取

`web.fetch({url, method?, headers?, body?, timeoutMs?})` 是通用 HTTP(S) 请求工具。method 默认 GET，支持 POST/PUT/PATCH/DELETE/HEAD 等合法方法；GET/HEAD 不能携带 body，CONNECT/TRACE/TRACK 不支持。headers 为字符串值的请求头对象，body 和 headers 位于高级设置。

body 未设置时不发送；字符串原样发送，不解析其中的 JSON；对象、数组或 null 经 Core JSON 校验后序列化，未指定 Content-Type 时自动添加 application/json，显式设置的 Content-Type 保持原样。暂不支持文件、FormData、二进制请求或响应。

输出 url（重定向后的最终地址）、status、headers、body。Content-Type 为 application/json 或 +json 时将响应解析为 JSON 数据，解析失败报 WEB_JSON；其他 text/*、XML/XHTML 返回原字符串。HTML 不执行脚本，也不提取正文。HEAD/204 等无响应体时 body 为 null。HTTP 4xx/5xx 正常返回状态和响应体，由流程决定如何处理，不当成网络异常。

timeoutMs 默认 10000，可设置 1–60000。请求体和解压后的响应分别上限 2 MiB，过大明确报 WEB_SIZE，不截断 JSON 或文本。字符集读取 Content-Type 的 charset，默认 UTF-8；不推断 HTML meta 编码。网络失败、超时、取消、非文本响应和不支持的编码分别报 WEB_NETWORK/TIMEOUT/CANCELLED/TYPE/ENCODING。

Editor 遵循网站 CORS、浏览器禁用请求头及响应头可见性规则，部分自定义头和方法会触发预检；当前不搭建代理。CLI 不受浏览器 CORS 限制。不自动发送浏览器登录凭据，不接受带用户名/密码的 URL，可通过 headers 显式提供接口认证。网络能力沿用宿主权限，支持本地 HTTP 服务；不是安全沙箱。

此接口替代早期网页正文读取接口：移除 maxChars、title、text、contentType、truncated，旧流程的 text 输出映射需要改为 body。网页提取后续由独立能力处理。返回数据大小不是模型 token 预算，小模型仍可能因历史加响应体超出上下文而失败。

## 信息查询

`web.search({query, limit?, provider?, maxSnippetChars?})` 接受未编码的非空关键词或问题，最多 500 个 UTF-16 单元；limit 默认 3，范围 1–5。底层复用 web.fetch，不调用日期工具。provider 优先于当前有效环境 SEARCH_PROVIDER；未设置时使用免 Key 的 mwmbl。不根据已有 Key 自动猜测供应商，不在失败后切换其他供应商。

| provider | 环境变量 | 请求与结果 |
| --- | --- | --- |
| mwmbl | 无 | GET 公共接口，读取 results |
| tavily | TAVILY_API_KEY | POST /search，固定 basic，不生成答案或读取全文，读取 results |
| bocha | BOCHA_API_KEY | POST https://api.bocha.cn/v1/web-search，summary=true，读取 data.webPages.value，优先使用 summary |

宿主在每次工具调用时读取有效环境，env.override/load 对后续调用生效，子流程继承同一运行环境。Key 仅放请求头，不作为 web.search 参数、流程字段或返回值。不新增通用 Base URL、代理或自动故障转移。请求协议见 [Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/search)、[博查](https://github.com/bocha-ai/dsh-web-search-bocha/blob/main/README.zh.md)。

仅返回 results，每项为 title、url、snippet；关键词保留在调用输入记录中，不重复输出。标题取前 160 个 UTF-16 单元、摘要默认前 240 个，maxSnippetChars 可设 1–10000，链接保留；它们是搜索摘要，不是全文，不保证发布日期、时效或新闻覆盖。空结果返回空数组；供应商或 Key 缺失/无效配置报 SEARCH_CONFIG，HTTP 非 2xx 报 SEARCH_HTTP，异常数据及服务业务错误报 SEARCH_RESPONSE，错误不回显服务响应正文。网络、超时、取消、大小限制沿用 web.fetch。CLI 与 Editor 注册同名工具，Editor 表单从共享定义生成。

搜索词发送给选定的供应商，不发送浏览器登录凭据；浏览器仍遵守 CORS。网络或 CORS 错误不能靠环境变量绕过。当前不增加 skill 加载机制。

2026-10-14 用户配置 Key 后在实际 Editor 中验证：同一关键词“Node.js 官方文档”、limit=3、maxSnippetChars=1200，博查和 Tavily 均完成真实搜索并返回三条结果。Tavily 本次命中 nodejs.org 官方页面，博查前三条为较旧的中文教程/转载；单一关键词不代表总体质量排名。全局 SEARCH_PROVIDER=bocha 保持原样。


## 编排基础库

除 time.now/web.fetch/web.search 外，以下工具统一输出 result：

| 工具 | 输入 | 行为 |
| --- | --- | --- |
| math.abs/floor/ceil/round | value | 绝对值、向下/向上取整、JS Math.round |
| math.min/max | values 数组 | 非空数值数组的最小/最大值 |
| math.clamp | value、min、max | 限制范围，要求 min ≤ max |
| math.random | min=0、max=1 | [min,max) 的随机小数，非密码学随机 |
| text.trim | text | 去掉两端空白 |
| text.split | text、separator | 字面分割；空分隔符按 JS UTF-16 单元分割 |
| text.replace | text、search、replacement | 替换所有字面匹配；search 不得为空，无正则或替换模板解释 |
| array.concat | arrays 数组的数组 | 合并一层，保留元素顺序 |
| array.slice | array、start=0、end? | JS 截取语义，支持负索引，end 不含在内 |
| array.length | array | 元素数量 |

数值要求有限 number，不隐式把文字转数字。文本及数组输入上限为 100000 UTF-16 单元/元素，文本替换与数组合并输出也受限。数组操作返回新数组、保留元素身份，不修改输入。加减乘除继续使用已有基础节点。script.run 中原生 Math、Date、JSON 仍可直接使用。

## 默认 Agent

新建与内置本地 Agent 将 time.now、web.search、web.fetch 内联到两个模型调用的 tools 列表，保留可编辑的显式工具循环。数学、文本、数组工具在调用选择器可用，默认不全部塞给小模型，避免工具描述占满上下文。已保存用户流程不自动覆盖。

示例：[基础编排](../examples/basic-tools.json)、[网页读取](../examples/web-fetch.yaml)。

默认 Agent 的系统提示只保留语言、按需使用工具与诚实回答等通用要求，不含搜索供应商、日期前置、URL 拼接或查询步骤；工具接口和说明提供具体用法。

Soyori 助手与新建模板独立；远程助手提供全部基础工具，本地使用 time.now/web.search/web.fetch 三个工具控制上下文开销。连接设置和路由见 [助手与浏览器运行](editor-assistant.md)。
