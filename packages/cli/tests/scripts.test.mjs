import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const fixtures = new URL("./fixtures/", import.meta.url);
function fixture(t, code = "export default ({ value }) => ({ value: value + 1 });") {
  const directory = mkdtempSync(join(tmpdir(), "agent-script-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "nested"));
  writeFileSync(join(directory, "nested", "script.js"), code);
  const flow = join(directory, "nested", "flow.json");
  writeFileSync(
    flow,
    JSON.stringify({
      schemaVersion: 1,
      name: "Script",
      fields: {
        code: { input: true, initial: "import fn from './script.js'; result(await fn(input));" },
        input: { initial: { value: 2 } },
        result: { output: true },
      },
      steps: [
        {
          type: "call",
          target: "script.run",
          inputs: { code: "$code", input: "$input" },
          output: "$result",
        },
      ],
    }),
  );
  return { directory, flow };
}
function run(flow, args = [], env = {}) {
  return spawnSync(process.execPath, [cli, "run", flow, "--json", ...args], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, SOYORI_TIMEOUT: "5s", ...env },
  });
}

test("built-in script uses ESM, async parameters and isolated logs", (t) => {
  const f = fixture(
    t,
    `console.log("module log");
export default async ({ value }) => {
  console.error("function log");
  await new Promise(resolve => setTimeout(resolve, 10));
  return { value: value + 1 };
};`,
  );
  const result = run(f.flow);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).result, { result: { value: 3 } });
  assert.match(result.stderr, /module log/);
  assert.match(result.stderr, /function log/);
});

test("nested flows resolve scripts against the caller, not the entry flow or cwd", (t) => {
  const f = fixture(t);
  const root = join(f.directory, "root.json");
  writeFileSync(
    root,
    JSON.stringify({
      schemaVersion: 1,
      name: "Root",
      imports: { child: "./nested/flow.json" },
      fields: { result: { output: true } },
      steps: [{ type: "call", target: "child", outputs: { result: "$result" } }],
    }),
  );
  const result = run(root);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).result, { result: { value: 3 } });
});

test("ESM imports resolve relative files, re-exports, builtins and dynamic imports", (t) => {
  const f = fixture(
    t,
    `import { n } from './bridge.js'; import { basename } from 'node:path';
    export default async () => ({ value: n + (await import('./dep.js')).n, base: basename('/a/b') });`,
  );
  writeFileSync(join(f.directory, "nested", "dep.js"), "export const n = 3;");
  writeFileSync(join(f.directory, "nested", "bridge.js"), "export { n } from './dep.js';");
  const result = run(f.flow);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).result.result, { value: 6, base: "b" });
  const flow = JSON.parse(readFileSync(f.flow, "utf8"));
  flow.steps[0].inputs = { code: "result((await import('./dep.js')).n);" };
  writeFileSync(f.flow, JSON.stringify(flow));
  const inline = run(f.flow);
  assert.equal(inline.status, 0, inline.stderr + inline.stdout);
  assert.equal(JSON.parse(inline.stdout).result.result, 3);
});
test("computed dynamic imports and require fail before executing code", (t) => {
  for (const code of [
    "export default (name) => import(name);",
    'export default () => require("node:fs");',
  ]) {
    const f = fixture(t, `console.error("must not execute"); ${code}`);
    const result = run(f.flow);
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error.message, /SCRIPT_IMPORT_UNSUPPORTED/);
    assert.doesNotMatch(result.stderr, /must not execute/);
  }
});

test("installed packages resolve from the calling script without installing anything", (t) => {
  const f = fixture(t, `import helper from 'local-helper'; export default () => helper('/a/b');`);
  const pkg = join(f.directory, "nested", "node_modules", "local-helper");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ name: "local-helper", main: "index.cjs" }),
  );
  writeFileSync(
    join(pkg, "index.cjs"),
    "const { basename } = require('node:path'); module.exports = basename;",
  );
  const result = run(f.flow);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(JSON.parse(result.stdout).result.result, "b");
});

test("script errors include flow origin and enforce JSON even without --json", (t) => {
  for (const code of [
    "export default 1;",
    "export default () => { throw new Error('failure'); };",
    "export default () => 1n;",
    "export default () => undefined;",
    "export default () => { const a = {}; a.a = a; return a; };",
    'export default () => Object.defineProperty({}, "x", { get() { return 1; }, enumerable: true });',
    "export default ( =>;",
  ]) {
    const f = fixture(t, code);
    const result = run(f.flow);
    assert.equal(result.status, 1, result.stdout);
    const error = JSON.parse(result.stdout).error;
    assert.equal(error.flowName, "Script");
    assert.equal(error.path, "steps[0]");
  }
  const f = fixture(t, "export default () => 1n;");
  const result = spawnSync(process.execPath, [cli, "run", f.flow], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSON-compatible/);
});

test("timeout environment covers loops and unresolved promises; flag takes precedence", (t) => {
  for (const code of [
    "while (true) {}",
    "export default () => { while (true) {} };",
    "export default () => new Promise(() => {});",
  ]) {
    const f = fixture(t, code);
    const result = run(f.flow, [], { SOYORI_TIMEOUT: "500ms" });
    assert.equal(result.status, 124, result.stderr + result.stdout);
    assert.equal(JSON.parse(result.stdout).error.code, "TIMEOUT");
  }
  const f = fixture(t);
  assert.equal(run(f.flow, ["--timeout", "5s"], { SOYORI_TIMEOUT: "1ms" }).status, 0);
  assert.equal(run(f.flow, [], { SOYORI_TIMEOUT: "invalid" }).status, 1);
  assert.equal(
    run(f.flow, [], { SOYORI_TIMEOUT: undefined, AGENT_PLAN_TIMEOUT: "1ms" }).status,
    124,
  );
  assert.equal(run(f.flow, [], { SOYORI_TIMEOUT: "5s", AGENT_PLAN_TIMEOUT: "1ms" }).status, 0);
});

test("validate registers script.run without reading the script", (t) => {
  const f = fixture(t, "throw new Error('must not execute');");
  const result = spawnSync(
    process.execPath,
    [cli, "validate", f.flow, "--set", "code=import './missing.js';", "--json"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout);
});

test("each call has fresh globals, copies input and terminates background timers", (t) => {
  const f = fixture(
    t,
    `export default (input) => {
    globalThis.calls = (globalThis.calls ?? 0) + 1;
    input.value++;
    setInterval(() => {}, 1000);
    return { calls: globalThis.calls, value: input.value };
  };`,
  );
  const flow = JSON.parse(readFileSync(f.flow, "utf8"));
  flow.fields.input.output = true;
  flow.fields.first = { output: true };
  flow.steps.unshift({ ...flow.steps[0], output: "$first" });
  writeFileSync(f.flow, JSON.stringify(flow));
  const result = run(f.flow);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, {
    input: { value: 2 },
    first: { calls: 1, value: 3 },
    result: { calls: 1, value: 3 },
  });
});

test("invalid sources fail and built-in names cannot be overridden", (t) => {
  const f = fixture(t);
  for (const source of [
    "missing.js",
    "http://example.com/script.js",
    "ftp://example.com/script.js",
    "",
  ]) {
    const result = run(f.flow, [
      "--set",
      `code=import fn from ${JSON.stringify(source)}; result(await fn(input));`,
    ]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).ok, false);
  }
  const registry = join(f.directory, "functions.mjs");
  writeFileSync(registry, 'export default { "script.run"() { return 42; } };');
  const result = run(f.flow, ["--functions", registry]);
  assert.equal(JSON.parse(result.stdout).error.code, "INVALID_FUNCTIONS");
});

test("HTTPS single-file loading, redirects, failures, size limit and download timeout", async (t) => {
  const f = fixture(t);
  const server = createServer(
    {
      key: readFileSync(new URL("localhost-key.pem", fixtures)),
      cert: readFileSync(new URL("localhost-cert.pem", fixtures)),
    },
    (request, response) => {
      if (request.url === "/stall") return;
      if (request.url === "/graph") {
        response.writeHead(302, { location: "/dir/main.js" });
        response.end();
        return;
      }
      if (request.url === "/dir/main.js") {
        response.end(
          "import { n } from './dep.js'; export default async ({ value }) => n * value;",
        );
        return;
      }
      if (request.url === "/dir/dep.js") {
        response.end("export const n = 2;");
        return;
      }
      if (request.url === "/local-import") {
        response.end("import x from 'file:///private.js'; export default () => x;");
        return;
      }
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/script.js" });
        response.end();
      } else if (request.url === "/downgrade") {
        response.writeHead(302, { location: "http://localhost/script.js" });
        response.end();
      } else if (request.url === "/large") response.end(" ".repeat(2 * 1024 * 1024 + 1));
      else if (request.url === "/missing") {
        response.writeHead(404);
        response.end();
      } else response.end("export default ({ value }) => value * 2;");
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  for (const [path, status, pattern] of [
    ["/script.js", 0],
    ["/redirect", 0],
    ["/graph", 0],
    ["/local-import", 1, /cannot import local/],
    ["/downgrade", 1, /HTTPS/],
    ["/missing", 1, /HTTP 404/],
    ["/large", 1, /2 MiB/],
    ["/stall", 124, /exceeded/],
  ]) {
    const child = spawn(
      process.execPath,
      [
        cli,
        "run",
        f.flow,
        "--json",
        "--set",
        `code=import fn from "https://127.0.0.1:${server.address().port}${path}"; result(await fn(input));`,
        "--timeout",
        "2s",
      ],
      {
        env: {
          ...process.env,
          NODE_EXTRA_CA_CERTS: fileURLToPath(new URL("localhost-cert.pem", fixtures)),
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    const [code] = await once(child, "close");
    assert.equal(code, status, stdout + stderr);
    const reply = JSON.parse(stdout);
    if (pattern) assert.match(reply.error.message, pattern);
    else assert.equal(reply.result.result, 4);
  }
});

test("code executes top level with global input and explicit result only", (t) => {
  const f = fixture(
    t,
    "console.error('side effect'); result(input.value); input.value++; result(input.value);",
  );
  const flow = JSON.parse(readFileSync(f.flow, "utf8"));
  flow.steps[0].inputs.code =
    "import './script.js'; await Promise.resolve(); result(input.value + 1);";
  writeFileSync(f.flow, JSON.stringify(flow));
  const reply = run(f.flow);
  assert.equal(reply.status, 0, reply.stdout + reply.stderr);
  assert.equal(JSON.parse(reply.stdout).result.result, 4);
  assert.match(reply.stderr, /side effect/);
  flow.steps[0].inputs.code = "export default () => { throw Error('must not call'); };";
  writeFileSync(f.flow, JSON.stringify(flow));
  assert.equal(JSON.parse(run(f.flow).stdout).result.result, null);
  flow.steps[0].inputs = { script: "./script.js" };
  writeFileSync(f.flow, JSON.stringify(flow));
  assert.equal(run(f.flow).status, 1);
});
