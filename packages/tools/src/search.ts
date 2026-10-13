import type { ToolDefinition } from "soyori-core";
import { createWebTool, type WebOptions } from "./web.js";

export const SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: "web.search",
  description:
    "Search the web for information, news, documentation or facts using keywords. Returns titles, source URLs and short snippets from Mwmbl. Results may be old; publication dates and latest news are not guaranteed. Empty results mean nothing was found.",
  inputs: [
    {
      name: "query",
      valueType: "string",
      required: true,
      description:
        "Keywords or a question to search for, up to 500 characters. No URL encoding needed.",
    },
    {
      name: "limit",
      valueType: "integer",
      defaultValue: 3,
      description: "Number of results, 1 to 5.",
    },
  ],
  outputs: [
    {
      name: "results",
      valueType: "JSON",
      description:
        "Array of { title, url, snippet }. Titles up to 160 characters, snippets up to 240; source URLs retained. Not full pages.",
    },
  ],
};

export function createSearchTool(options: WebOptions) {
  const request = createWebTool(options);
  return async ({ query, limit = 3 }: Record<string, unknown>) => {
    if (typeof query !== "string" || !query.trim() || query.length > 500)
      throw Error("SEARCH_INPUT: Expected nonempty query up to 500 characters.");
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 5)
      throw Error("SEARCH_INPUT: Expected limit between 1 and 5.");
    const keywords = query.trim();
    const address = new URL("https://api.mwmbl.org/api/v2/search/");
    address.searchParams.set("q", keywords);
    const response = await request({ url: address.href });
    if (response.status < 200 || response.status >= 300)
      throw Error(`SEARCH_HTTP: Search service returned HTTP ${response.status}.`);
    const body = response.body;
    if (!body || typeof body !== "object" || !("results" in body) || !Array.isArray(body.results))
      throw Error("SEARCH_RESPONSE: Invalid search results.");
    const results = body.results.slice(0, limit).map((item: unknown) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("title" in item) ||
        typeof item.title !== "string" ||
        !("url" in item) ||
        typeof item.url !== "string" ||
        !("content" in item) ||
        typeof item.content !== "string"
      )
        throw Error("SEARCH_RESPONSE: Invalid search result entry.");
      let url: URL;
      try {
        url = new URL(item.url);
      } catch {
        throw Error("SEARCH_RESPONSE: Invalid source URL.");
      }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw Error("SEARCH_RESPONSE: Unsupported source URL.");
      return {
        title: item.title.slice(0, 160),
        url: item.url,
        snippet: item.content.slice(0, 240),
      };
    });
    return { results };
  };
}
