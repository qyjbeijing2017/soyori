# agent-plan-tools

CLI 与 Editor 共享的通用 call 工具。接口由 BASIC_TOOL_DEFINITIONS 提供，每个 createBasicTools() 返回的函数具有相同 definition，Editor 直接据此展示参数、输出和折叠的高级设置。

工具与边界见 [基础工具](../docs/basic-tools.md)。实现复用 JavaScript Math、String、Array、Intl 和原生 fetch；web.fetch 提供 HTTP 方法、请求头与 JSON/文本 body，不解析 HTML 正文。web.search 复用 web.fetch 封装 Mwmbl 公共搜索，提供精简标题、链接和摘要；不保证新闻时效。不自动加载脚本、不提供浏览器代理。

在根 workspace 运行 `pnpm --filter agent-plan-tools test`。此包依赖 workspace core，未发布独立 npm 包。
