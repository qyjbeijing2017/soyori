import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createRuntime } from "soyori-core";
import { loadFlowGraph } from "../dist/flow-loader.js";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const execute = promisify(execFile);
const flow = (imports = {}, steps = [], fields = {}) => ({
  schemaVersion: 1,
  name: "Same name",
  imports,
  fields,
  steps,
});
const call = (key, output = "result") => ({
  type: "call",
  target: key,
  output: `$${output}`,
});
const output = { result: { output: true } };
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "agent-imports-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function server(t, handler) {
  const instance = createServer(handler);
  instance.listen(0, "127.0.0.1");
  await once(instance, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        instance.close(resolve);
        instance.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${instance.address().port}`;
}
async function run(...args) {
  try {
    return await execute(process.execPath, [cli, ...args, "--json"], { timeout: 15_000 });
  } catch (error) {
    return error;
  }
}

test("nested local imports use each file directory and allow identical local aliases", async (t) => {
  const dir = await directory(t);
  for (const [name, value] of [
    ["a", 1],
    ["b", 2],
  ]) {
    await mkdir(join(dir, name));
    await writeFile(
      join(dir, name, "parent.json"),
      JSON.stringify(flow({ helper: "./helper.yaml" }, [call("helper")], output)),
    );
    await writeFile(
      join(dir, name, "helper.yaml"),
      `schemaVersion: 1\nname: Same name\nfields: {value: {initial: ${value}, output: true}}\nsteps: []`,
    );
  }
  const entry = join(dir, "entry.json");
  await writeFile(
    entry,
    JSON.stringify(
      flow({ a: "./a/parent.json", b: "./b/parent.json" }, [call("a", "a"), call("b", "b")], {
        a: { output: true },
        b: { output: true },
      }),
    ),
  );
  const graph = await loadFlowGraph(entry);
  assert.deepEqual((await createRuntime(graph).run()).output, {
    a: { result: { value: 1 } },
    b: { result: { value: 2 } },
  });
  assert.equal(
    graph.imports.get("a").imports.get("helper").source,
    pathToFileURL(await realpath(join(dir, "a", "helper.yaml"))).href,
  );
  assert.equal(JSON.parse((await run("run", entry)).stdout).ok, true);
});

test("redirected root resolves nested relative URLs from final URL, retaining source and cache", async (t) => {
  const counts = new Map();
  const base = await server(t, (req, res) => {
    counts.set(req.url, (counts.get(req.url) ?? 0) + 1);
    if (req.url === "/start") {
      res.writeHead(302, { location: "/package/main.yaml?version=1" });
      res.end();
    } else if (req.url === "/package/main.yaml?version=1")
      res.end(
        "schemaVersion: 1\nname: Remote\nimports: {first: ./child.json, second: ./child.json}\nfields: {result: {output: true}}\nsteps: [{type: call, target: first, output: $result}]",
      );
    else if (req.url === "/package/child.json")
      res.end(JSON.stringify(flow({}, [], { count: { initial: 4, output: true } })));
    else {
      res.writeHead(404);
      res.end();
    }
  });
  const graph = await loadFlowGraph(`${base}/start`);
  assert.equal(graph.source, `${base}/package/main.yaml?version=1`);
  assert.strictEqual(graph.imports.get("first"), graph.imports.get("second"));
  assert.equal(counts.get("/package/child.json"), 1);
  assert.deepEqual((await createRuntime(graph).run()).output, { result: { count: 4 } });
  const result = await run("run", `${base}/start`);
  assert.deepEqual(JSON.parse(result.stdout).result, { result: { count: 4 } });
});

test("local flows can import remote sources; remote cycles reuse nodes", async (t) => {
  let reads = 0;
  const base = await server(t, (_req, res) => {
    reads++;
    res.end(JSON.stringify(flow({ self: "./self.json" }, [call("self")])));
  });
  const dir = await directory(t);
  const entry = join(dir, "root.json");
  await writeFile(entry, JSON.stringify(flow({ remote: `${base}/self.json` }, [call("remote")])));
  const graph = await loadFlowGraph(entry);
  const child = graph.imports.get("remote");
  assert.strictEqual(child, child.imports.get("self"));
  assert.equal(reads, 1);
  assert.equal(
    (await createRuntime(graph, {}, { maxCallDepth: 3 }).run()).error.code,
    "CALL_DEPTH_LIMIT",
  );
});

test("remote documents and redirects cannot read local files or unsupported protocols", async (t) => {
  let reference;
  const base = await server(t, (req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: reference });
      res.end();
    } else res.end(JSON.stringify(flow({ local: reference })));
  });
  for (reference of [
    "file:///C:/private.json",
    " file:///C:/private.json",
    "\tfile:///C:/private.json",
    "C:\\private.json",
    "\\\\host\\private.json",
    "ftp://example.test/flow.json",
  ]) {
    for (const entry of ["/root.json", "/redirect"]) {
      await assert.rejects(loadFlowGraph(base + entry), (e) => e.code === "INVALID_IMPORT");
    }
  }
});

test("local cycles and alternate file spellings have one source identity", async (t) => {
  const dir = await directory(t);
  const entry = join(dir, "root.json");
  await writeFile(
    entry,
    JSON.stringify(flow({ self: "./root.json", same: pathToFileURL(entry).href })),
  );
  const graph = await loadFlowGraph(entry);
  assert.strictEqual(graph, graph.imports.get("self"));
  assert.strictEqual(graph, graph.imports.get("same"));
});

test("root CLI imports are explicit aliases and do not become global registrations", async (t) => {
  const dir = await directory(t);
  const entry = join(dir, "root.json");
  await writeFile(entry, JSON.stringify(flow({}, [call("child")], output)));
  await writeFile(
    join(dir, "child.json"),
    JSON.stringify(flow({}, [], { value: { initial: 9, output: true } })),
  );
  const result = await run("run", entry, "--flows", "child=./child.json");
  assert.deepEqual(JSON.parse(result.stdout).result, { result: { value: 9 } });
  for (const extras of [
    ["child.json"],
    ["child="],
    ["=child.json"],
    ["child=./child.json", "child=./child.json"],
  ]) {
    await assert.rejects(loadFlowGraph(entry, extras), (e) => e.code === "INVALID_IMPORT");
  }
  await writeFile(entry, JSON.stringify(flow({ child: "./child.json" })));
  await assert.rejects(loadFlowGraph(entry, ["child=./child.json"]), /Duplicate root import/);
});

test("missing unused imports fail before host module evaluation; inspect lists them without loading", async (t) => {
  const dir = await directory(t);
  const entry = join(dir, "root.json");
  const module = join(dir, "host.mjs");
  await writeFile(entry, JSON.stringify(flow({ unused: "./missing.yaml" })));
  await writeFile(module, 'throw new Error("host module executed");');
  const result = JSON.parse((await run("run", entry, "--functions", module)).stdout);
  assert.equal(result.error.code, "FILE_READ_ERROR");
  const inspection = JSON.parse((await run("inspect", entry)).stdout);
  assert.deepEqual(inspection.result.imports, { unused: "./missing.yaml" });
});

test("network status, redirects, size and timeout fail with explicit errors", async (t) => {
  const base = await server(t, (req, res) => {
    if (req.url === "/missing") {
      res.writeHead(404);
      res.end();
    } else if (req.url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
    } else if (req.url === "/large") res.end("x".repeat(2 * 1024 * 1024 + 1));
    // /hang deliberately leaves response pending.
  });
  for (const [path, code] of [
    ["/missing", "HTTP_ERROR"],
    ["/loop", "HTTP_ERROR"],
    ["/large", "FLOW_TOO_LARGE"],
  ]) {
    await assert.rejects(loadFlowGraph(base + path), (e) => e.code === code);
  }
  const result = JSON.parse((await run("run", `${base}/hang`, "--timeout", "1s")).stdout);
  assert.equal(result.error.code, "TIMEOUT");
});

test("graph document count is bounded before execution", async (t) => {
  const base = await server(t, (req, res) => {
    const n = Number(req.url.slice(1));
    res.end(JSON.stringify(flow({ next: `./${n + 1}` })));
  });
  await assert.rejects(loadFlowGraph(`${base}/0`), (e) => e.code === "IMPORT_LIMIT");
});
