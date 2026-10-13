import assert from "node:assert/strict";
import test from "node:test";
import { BASIC_TOOL_DEFINITIONS, createBasicTools } from "../dist/index.js";

test("search encodes plain keywords, limits and normalizes snippets, and fails honestly", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let payload = {
    results: Array.from({ length: 8 }, (_, i) => ({
      title: `title${i}`,
      url: `https://example.com/${i}`,
      content: "x".repeat(500),
      ignored: true,
    })),
  };
  let status = 200;
  globalThis.fetch = async (address, options) => {
    calls++;
    const url = new URL(address);
    assert.equal(url.origin, "https://api.mwmbl.org");
    assert.equal(url.pathname, "/api/v2/search/");
    assert.equal(url.searchParams.get("q"), "中文 & news?");
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const tools = createBasicTools();
    assert.equal(tools["web.search"].definition, BASIC_TOOL_DEFINITIONS["web.search"]);
    const result = await tools["web.search"]({ query: " 中文 & news? " });
    assert.deepEqual(Object.keys(result), ["results"]);
    assert.equal(result.results.length, 3);
    assert.deepEqual(result.results[0], {
      title: "title0",
      url: "https://example.com/0",
      snippet: "x".repeat(240),
    });
    assert.equal(
      (await tools["web.search"]({ query: "中文 & news?", limit: 1 })).results.length,
      1,
    );
    const before = calls;
    for (const input of [
      {},
      { query: " " },
      { query: "x".repeat(501) },
      { query: "valid", limit: 0 },
      { query: "valid", limit: 6 },
      { query: "valid", limit: "3" },
    ])
      await assert.rejects(tools["web.search"](input), /SEARCH_INPUT/);
    assert.equal(calls, before);
    payload = { results: [] };
    assert.deepEqual((await tools["web.search"]({ query: "中文 & news?" })).results, []);
    status = 503;
    await assert.rejects(tools["web.search"]({ query: "中文 & news?" }), /SEARCH_HTTP.*503/);
    status = 200;
    for (const body of [
      {},
      { results: "bad" },
      { results: [{}] },
      { results: [{ title: "x", url: "javascript:alert(1)", content: "x" }] },
    ]) {
      payload = body;
      await assert.rejects(tools["web.search"]({ query: "中文 & news?" }), /SEARCH_RESPONSE/);
    }
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      createBasicTools({ signal: controller.signal })["web.search"]({ query: "test" }),
      /WEB_CANCELLED/,
    );
    globalThis.fetch = async () => {
      throw new TypeError("failed");
    };
    await assert.rejects(
      createBasicTools({ browser: true })["web.search"]({ query: "test" }),
      /WEB_NETWORK.*CORS/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
