import { type ToolDefinition, toJsonValue } from "soyori-core";
export interface WebOptions {
  signal?: AbortSignal;
  browser?: boolean;
}
export const WEB_TOOL_DEFINITION: ToolDefinition = {
  name: "web.fetch",
  description:
    "发送 HTTP(S) 请求。对象或数组 body 自动编码为 JSON，字符串原样发送；响应 JSON 自动解析，其他文本原样返回，不提取 HTML 正文。HTTP 错误状态也返回 status 和 body。",
  inputs: [
    { name: "url", valueType: "string", required: true },
    {
      name: "method",
      valueType: "string",
      defaultValue: "GET",
      description: "HTTP 方法，例如 GET、POST、PUT、PATCH、DELETE、HEAD。GET/HEAD 不允许 body。",
    },
    {
      type: "group",
      name: "高级设置",
      collapsed: true,
      fields: [
        {
          name: "headers",
          valueType: "JSON",
          description:
            '请求头对象，值必须是字符串，例如 {"Content-Type": "application/json"}。浏览器受 CORS 和请求头限制。',
        },
        {
          name: "body",
          valueType: "JSON",
          description: "对象或数组自动编码为 JSON；字符串原样发送；未设置则不发送。",
        },
        { name: "timeoutMs", valueType: "integer", defaultValue: 10000 },
      ],
    },
  ],
  outputs: [
    { name: "url", valueType: "string" },
    { name: "status", valueType: "integer" },
    { name: "headers", valueType: "JSON" },
    {
      name: "body",
      valueType: "JSON",
      description: "JSON 响应解析为数据，文本响应为字符串；无响应体为 null。",
    },
  ],
};
function limit(value: unknown, fallback: number, max: number) {
  const n = value === undefined ? fallback : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > max)
    throw Error(`WEB_INPUT: Expected integer 1–${max}.`);
  return n;
}
export function createWebTool(options: WebOptions) {
  return async ({ url, method = "GET", headers, body, timeoutMs }: Record<string, unknown>) => {
    if (typeof url !== "string") throw Error("WEB_INPUT: Expected an HTTP(S) URL.");
    let address: URL;
    try {
      address = new URL(url);
    } catch {
      throw Error("WEB_INPUT: Invalid URL.");
    }
    if (!["http:", "https:"].includes(address.protocol) || address.username || address.password)
      throw Error("WEB_INPUT: Only HTTP(S) URLs without credentials are supported.");
    if (typeof method !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method))
      throw Error("WEB_INPUT: Invalid HTTP method.");
    const verb = method.toUpperCase();
    if (["CONNECT", "TRACE", "TRACK"].includes(verb))
      throw Error("WEB_INPUT: Unsupported HTTP method.");
    let requestHeaders: Headers;
    try {
      requestHeaders = new Headers();
      if (headers !== undefined) {
        if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw Error();
        for (const [key, value] of Object.entries(
          toJsonValue(headers) as Record<string, unknown>,
        )) {
          if (typeof value !== "string") throw Error();
          requestHeaders.append(key, value);
        }
      }
    } catch {
      throw Error("WEB_INPUT: Expected a valid header object with string values.");
    }
    let requestBody: string | undefined;
    if (body !== undefined) {
      if (["GET", "HEAD"].includes(verb)) throw Error("WEB_INPUT: GET/HEAD cannot have a body.");
      if (typeof body === "string") requestBody = body;
      else if (body === null || typeof body === "object") {
        requestBody = JSON.stringify(toJsonValue(body));
        if (!requestHeaders.has("content-type"))
          requestHeaders.set("content-type", "application/json");
      } else throw Error("WEB_INPUT: Body must be text, an object, an array or null.");
      if (new TextEncoder().encode(requestBody).byteLength > 2 * 1024 * 1024)
        throw Error("WEB_SIZE: Request body exceeds 2 MiB.");
    }
    const timeout = limit(timeoutMs, 10000, 60000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      signal.throwIfAborted();
      const response = await fetch(address, {
        signal,
        credentials: "omit",
        method: verb,
        headers: requestHeaders,
        body: requestBody,
      });
      const contentType = response.headers.get("content-type") ?? "text/plain";
      const media = contentType.split(";")[0].trim().toLowerCase();
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const result = {
        url: response.url || address.href,
        status: response.status,
        headers: responseHeaders,
      };
      if (!response.body) return { ...result, body: null };
      const json = media === "application/json" || media.endsWith("+json");
      if (
        !json &&
        !media.startsWith("text/") &&
        !["application/json", "application/xml", "application/xhtml+xml"].includes(media)
      )
        throw Error("WEB_TYPE: Only JSON and text responses are supported.");
      const maxBytes = 2 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > maxBytes)
        throw Error("WEB_SIZE: Response exceeds 2 MiB.");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) throw Error("WEB_SIZE: Response exceeds 2 MiB.");
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1] ?? "utf-8";
      let raw: string;
      try {
        raw = new TextDecoder(charset).decode(bytes);
      } catch {
        throw Error("WEB_ENCODING: Unsupported response charset.");
      }
      signal.throwIfAborted();
      if (json) {
        try {
          return { ...result, body: JSON.parse(raw) as unknown };
        } catch {
          throw Error("WEB_JSON: Invalid JSON response.");
        }
      }
      return { ...result, body: raw };
    } catch (error) {
      if (options.signal?.aborted) throw Error("WEB_CANCELLED: Request cancelled.");
      if (controller.signal.aborted) throw Error("WEB_TIMEOUT: Request timed out.");
      if (error instanceof Error && /^WEB_/.test(error.message)) throw error;
      throw Error(
        options.browser
          ? "WEB_NETWORK: Request failed; possible network error or website CORS restriction."
          : "WEB_NETWORK: Request failed; check network access.",
      );
    } finally {
      clearTimeout(timer);
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      } else controller.abort();
    }
  };
}
