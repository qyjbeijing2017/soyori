import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createBasicTools } from "../dist/index.js";

async function server(t) {
  const s = createServer(async (req, res) => {
    if (req.url === "/slow") return;
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/html" });
      res.end();
      return;
    }
    if (req.url === "/empty") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === "/echo") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      res.writeHead(200, { "content-type": "application/json", "x-example": "yes" });
      res.end(
        JSON.stringify({
          method: req.method,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        }),
      );
      return;
    }
    if (req.url === "/json") {
      res.writeHead(200, { "content-type": "application/problem+json" });
      res.end('{"value":42}');
      return;
    }
    if (req.url === "/bad-json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{bad");
      return;
    }
    if (req.url === "/binary") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end("binary");
      return;
    }
    if (req.url === "/huge") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("a".repeat(2 * 1024 * 1024 + 1));
      return;
    }
    if (req.url === "/404") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<main>Hello<script>code</script></main>");
  });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    s.closeAllConnections();
    s.close();
  });
  return `http://127.0.0.1:${s.address().port}`;
}
test("web.fetch returns raw HTML, parsed JSON, headers and HTTP error bodies", async (t) => {
  const base = await server(t),
    fetch = createBasicTools()["web.fetch"];
  const html = await fetch({ url: `${base}/redirect` });
  assert.equal(html.url, `${base}/html`);
  assert.equal(html.body, "<main>Hello<script>code</script></main>");
  assert.equal(html.status, 200);
  assert.match(html.headers["content-type"], /text\/html/);
  assert.deepEqual((await fetch({ url: `${base}/json` })).body, { value: 42 });
  const failed = await fetch({ url: `${base}/404` });
  assert.equal(failed.status, 404);
  assert.equal(failed.body, "missing");
  assert.equal((await fetch({ url: `${base}/empty` })).body, null);
  assert.equal((await fetch({ url: `${base}/html`, method: "HEAD" })).body, null);
});
test("web.fetch sends methods, JSON and literal text without overriding headers", async (t) => {
  const base = await server(t),
    fetch = createBasicTools()["web.fetch"];
  const obj = { hello: "世界" };
  const r = await fetch({
    url: `${base}/echo`,
    method: "post",
    headers: { "X-Custom": "yes" },
    body: obj,
  });
  assert.equal(r.body.method, "POST");
  assert.equal(r.body.headers["content-type"], "application/json");
  assert.equal(r.body.headers["x-custom"], "yes");
  assert.equal(r.body.body, JSON.stringify(obj));
  assert.equal(r.headers["x-example"], "yes");
  assert.deepEqual(obj, { hello: "世界" });
  const raw = await fetch({
    url: `${base}/echo`,
    method: "PATCH",
    body: "{not json}",
    headers: { "Content-Type": "text/plain" },
  });
  assert.equal(raw.body.body, "{not json}");
  assert.equal(raw.body.headers["content-type"], "text/plain");
  assert.equal(
    (await fetch({ url: `${base}/echo`, method: "PUT", body: [1, 2] })).body.body,
    "[1,2]",
  );
  assert.equal((await fetch({ url: `${base}/echo`, method: "DELETE" })).body.body, "");
});
test("web.fetch rejects invalid requests, parsing failures, limits and aborts", async (t) => {
  const base = await server(t),
    fetch = createBasicTools()["web.fetch"];
  for (const input of [
    { method: "GET", body: {} },
    { method: "HEAD", body: "" },
    { method: "bad method" },
    { method: "TRACE" },
    { headers: { test: 1 } },
    { headers: { "bad name": "x" } },
    { body: 1, method: "POST" },
  ])
    await assert.rejects(fetch({ url: `${base}/echo`, ...input }), /WEB_INPUT/);
  await assert.rejects(fetch({ url: `${base}/bad-json` }), /WEB_JSON/);
  await assert.rejects(fetch({ url: `${base}/binary` }), /WEB_TYPE/);
  await assert.rejects(fetch({ url: `${base}/huge` }), /WEB_SIZE/);
  await assert.rejects(
    fetch({ url: `${base}/echo`, method: "POST", body: "a".repeat(2 * 1024 * 1024 + 1) }),
    /WEB_SIZE/,
  );
  await assert.rejects(fetch({ url: `${base}/slow`, timeoutMs: 20 }), /WEB_TIMEOUT/);
  await assert.rejects(fetch({ url: "file:///local" }), /WEB_INPUT/);
  await assert.rejects(fetch({ url: "https://user:secret@example.com" }), /WEB_INPUT/);
  const controller = new AbortController();
  const pending = createBasicTools({ signal: controller.signal })["web.fetch"]({
    url: `${base}/slow`,
  });
  controller.abort();
  await assert.rejects(pending, /WEB_CANCELLED/);
});
