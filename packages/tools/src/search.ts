import type { ToolDefinition } from "soyori-core";
import { createWebTool, type WebOptions } from "./web.js";

export interface SearchOptions extends WebOptions {
  /** Read at call time, so runtime overrides affect subsequent searches. */
  environment?: Readonly<Record<string, string>>;
}
const providers = ["mwmbl", "tavily", "bocha"] as const;
type Provider = (typeof providers)[number];
const keyNames = {
  tavily: "TAVILY_API_KEY",
  bocha: "BOCHA_API_KEY",
} as const;

export const SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: "web.search",
  description:
    "Search the web for information, news, documentation or facts using keywords. Uses SEARCH_PROVIDER from the runtime environment. Returns source titles, URLs and snippets. Results may be old; empty results mean nothing was found. Never request or pass API keys as tool arguments.",
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
    {
      type: "group",
      name: "高级设置",
      collapsed: true,
      fields: [
        {
          name: "provider",
          valueType: "string",
          description:
            "mwmbl, tavily or bocha. Omit to use SEARCH_PROVIDER, or mwmbl if unset. No automatic fallback on failure.",
        },
        {
          name: "maxSnippetChars",
          valueType: "integer",
          defaultValue: 240,
          description:
            "Maximum characters per result snippet, 1 to 10000. Increase for richer search context; longer snippets use more model tokens.",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "results",
      valueType: "JSON",
      description:
        "Array of { title, url, snippet }. Titles up to 160 characters; snippets limited by maxSnippetChars. Source URLs retained. Not full pages.",
    },
  ],
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function entry(value: unknown) {
  if (!record(value)) throw Error("SEARCH_RESPONSE: Invalid search result entry.");
  return value;
}
function result(title: unknown, url: unknown, snippet: unknown, maxSnippetChars: number) {
  if (typeof title !== "string" || typeof url !== "string" || typeof snippet !== "string")
    throw Error("SEARCH_RESPONSE: Invalid search result entry.");
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    throw Error("SEARCH_RESPONSE: Invalid source URL.");
  }
  if (!["http:", "https:"].includes(address.protocol) || address.username || address.password)
    throw Error("SEARCH_RESPONSE: Unsupported source URL.");
  return { title: title.slice(0, 160), url, snippet: snippet.slice(0, maxSnippetChars) };
}
function items(body: unknown, provider: Provider): unknown[] {
  if (!record(body)) throw Error("SEARCH_RESPONSE: Invalid search results.");
  let values: unknown;
  switch (provider) {
    case "mwmbl":
    case "tavily":
      values = body.results;
      break;
    case "bocha": {
      if (body.code !== 200 || !record(body.data))
        throw Error("SEARCH_RESPONSE: bocha reported a search failure.");
      const pages = body.data.webPages;
      values = record(pages) ? pages.value : pages === undefined ? [] : undefined;
      break;
    }
  }
  if (!Array.isArray(values)) throw Error("SEARCH_RESPONSE: Invalid search results.");
  return values;
}

export function createSearchTool(options: SearchOptions) {
  const request = createWebTool(options);
  return async ({
    query,
    limit = 3,
    provider: selected,
    maxSnippetChars = 240,
  }: Record<string, unknown>) => {
    if (typeof query !== "string" || !query.trim() || query.length > 500)
      throw Error("SEARCH_INPUT: Expected nonempty query up to 500 characters.");
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 5)
      throw Error("SEARCH_INPUT: Expected limit between 1 and 5.");
    if (
      typeof maxSnippetChars !== "number" ||
      !Number.isSafeInteger(maxSnippetChars) ||
      maxSnippetChars < 1 ||
      maxSnippetChars > 10000
    )
      throw Error("SEARCH_INPUT: Expected maxSnippetChars between 1 and 10000.");
    const environment = options.environment ?? {};
    const configured = selected ?? environment.SEARCH_PROVIDER ?? "mwmbl";
    if (typeof configured !== "string" || !providers.includes(configured.trim() as Provider))
      throw Error("SEARCH_CONFIG: Expected provider mwmbl, tavily or bocha.");
    const provider = configured.trim() as Provider;
    const keywords = query.trim();
    let input: Record<string, unknown>;
    if (provider === "mwmbl") {
      const address = new URL("https://api.mwmbl.org/api/v2/search/");
      address.searchParams.set("q", keywords);
      input = { url: address.href };
    } else {
      const keyName = keyNames[provider];
      const key = environment[keyName]?.trim();
      if (!key)
        throw Error(`SEARCH_CONFIG: Set ${keyName} in the runtime environment for ${provider}.`);
      const headers = { Authorization: `Bearer ${key}` };
      switch (provider) {
        case "tavily":
          input = {
            url: "https://api.tavily.com/search",
            method: "POST",
            headers,
            body: {
              query: keywords,
              max_results: limit,
              search_depth: "basic",
              include_answer: false,
              include_raw_content: false,
            },
          };
          break;
        case "bocha":
          input = {
            url: "https://api.bocha.cn/v1/web-search",
            method: "POST",
            headers,
            body: { query: keywords, count: limit, summary: true, freshness: "noLimit" },
          };
          break;
      }
    }
    const response = await request(input);
    if (response.status < 200 || response.status >= 300)
      throw Error(
        `SEARCH_HTTP: ${provider} returned HTTP ${response.status}; check credentials, quota and service availability.`,
      );
    const results = items(response.body, provider)
      .slice(0, limit)
      .map((raw) => {
        const item = entry(raw);
        if (provider === "bocha")
          return result(
            item.name,
            item.url,
            typeof item.summary === "string" && item.summary ? item.summary : (item.snippet ?? ""),
            maxSnippetChars,
          );
        return result(item.title, item.url, item.content, maxSnippetChars);
      });
    return { results };
  };
}
