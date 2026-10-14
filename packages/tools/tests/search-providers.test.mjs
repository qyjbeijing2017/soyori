import assert from "node:assert/strict";
import test from "node:test";
import { createBasicTools } from "../dist/index.js";

const page = { title: "source", url: "https://example.com/source", content: "x".repeat(900) };
const cases = [
  {
    provider: "tavily",
    key: "TAVILY_API_KEY",
    url: "https://api.tavily.com/search",
    payload: { results: [page] },
  },
  {
    provider: "bocha",
    key: "BOCHA_API_KEY",
    url: "https://api.bocha.cn/v1/web-search",
    payload: {
      code: 200,
      data: {
        webPages: {
          value: [{ name: page.title, url: page.url, summary: page.content, snippet: "short" }],
        },
      },
    },
  },
];
test("search providers use environment credentials, native requests and the same bounded result format", async (t) => {
  for (const sample of cases)
    await t.test(sample.provider, async (t) => {
      let calls = 0;
      t.mock.method(globalThis, "fetch", async (address, options) => {
        calls++;
        const url = new URL(address);
        assert.equal(url.origin + url.pathname, sample.url);
        assert.equal(options.credentials, "omit");
        assert.equal(options.headers.get("Authorization"), "Bearer test-key");
        assert.equal(options.method, "POST");
        const body = JSON.parse(options.body);
        assert.equal(options.headers.get("content-type"), "application/json");
        assert.equal(JSON.stringify(body).includes("test-key"), false);
        assert.equal(body.query, "中文 & news?");
        assert.equal(body[sample.provider === "tavily" ? "max_results" : "count"], 1);
        if (sample.provider === "tavily") {
          assert.equal(body.search_depth, "basic");
          assert.equal(body.include_answer, false);
          assert.equal(body.include_raw_content, false);
        }
        if (sample.provider === "bocha") assert.equal(body.summary, true);
        return Response.json(sample.payload);
      });
      const search = createBasicTools({
        environment: { SEARCH_PROVIDER: sample.provider, [sample.key]: "test-key" },
      })["web.search"];
      assert.deepEqual(await search({ query: " 中文 & news? ", limit: 1, maxSnippetChars: 1200 }), {
        results: [{ title: page.title, url: page.url, snippet: page.content }],
      });
      assert.equal(
        (await search({ query: "中文 & news?", limit: 1 })).results[0].snippet.length,
        240,
      );
      for (const maxSnippetChars of [0, 10001, 1.5, "1200", null])
        await assert.rejects(search({ query: "test", maxSnippetChars }), /SEARCH_INPUT/);
      assert.equal(calls, 2);
      t.mock.restoreAll();
    });
});

test("search selection reads live environment overrides and never silently falls back", async (t) => {
  let environment = { SEARCH_PROVIDER: "bocha" };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (address) => {
    calls++;
    assert.equal(new URL(address).host, "api.tavily.com");
    return Response.json({ results: [page] });
  });
  const search = createBasicTools({
    get environment() {
      return environment;
    },
  })["web.search"];
  await assert.rejects(search({ query: "test" }), /SEARCH_CONFIG.*BOCHA_API_KEY/);
  environment = { SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "secret" };
  assert.equal((await search({ query: "test" })).results.length, 1);
  environment = { ...environment, SEARCH_PROVIDER: "invalid" };
  assert.equal((await search({ query: "test", provider: "tavily" })).results.length, 1);
  for (const provider of ["invalid", "brave", "baidu", "", 5, {}])
    await assert.rejects(search({ query: "test", provider }), /SEARCH_CONFIG/);
  for (const provider of ["brave", "baidu"]) {
    environment = { ...environment, SEARCH_PROVIDER: provider };
    await assert.rejects(search({ query: "test" }), /SEARCH_CONFIG/);
  }
  await assert.rejects(search({ query: "test" }), /SEARCH_CONFIG/);
  assert.equal(calls, 2);
});

test("provider errors, malformed results and invalid URLs fail without leaking service messages or credentials", async (t) => {
  for (const sample of cases) {
    let payload = sample.payload;
    let status = 401;
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return Response.json(status === 401 ? { message: "secret-token" } : payload, { status });
    });
    const search = createBasicTools({
      environment: { SEARCH_PROVIDER: sample.provider, [sample.key]: "secret-token" },
    })["web.search"];
    await assert.rejects(
      search({ query: "test" }),
      (error) => /SEARCH_HTTP.*401/.test(error.message) && !error.message.includes("secret-token"),
    );
    assert.equal(calls, 1);
    status = 200;
    payload = { code: 500, message: "secret-token" };
    await assert.rejects(
      search({ query: "test" }),
      (error) => /SEARCH_RESPONSE/.test(error.message) && !error.message.includes("secret-token"),
    );
    payload = structuredClone(sample.payload);
    const item = sample.provider === "bocha" ? payload.data.webPages.value[0] : payload.results[0];
    item.url = "https://user:secret-token@example.com";
    await assert.rejects(search({ query: "test" }), /SEARCH_RESPONSE: Unsupported source URL/);
    t.mock.restoreAll();
  }
});

test("valid no-match responses stay distinct from service failures", async (t) => {
  for (const sample of cases) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        sample.provider === "bocha"
          ? { code: 200, data: { webPages: { value: [] } } }
          : { results: [] },
      ),
    );
    assert.deepEqual(
      await createBasicTools({
        environment: { SEARCH_PROVIDER: sample.provider, [sample.key]: "key" },
      })["web.search"]({ query: "test" }),
      { results: [] },
    );
    t.mock.restoreAll();
  }
});
