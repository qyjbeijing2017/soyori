import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { saveEnvironment } from "soyori-storage/environment";
import { createFileStorage } from "soyori-storage/node";

test("CLI LLM calls inherit global connection environment without explicit credentials", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agent-env-llm-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requests = [];
  const server = createServer(async (req, res) => {
    let content = "";
    for await (const chunk of req) content += chunk;
    const body = JSON.parse(content);
    requests.push({ headers: req.headers, body });
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "test",
        object: "chat.completion",
        model: body.model,
        choices: [
          { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const store = createFileStorage(join(root, ".environment"));
  await saveEnvironment(store, { OPENAI_MODEL: { value: "global-model", sensitive: false } });
  await saveEnvironment(store, {
    OPENAI_MODEL: { value: "thread-model", sensitive: false },
    OPENAI_API_KEY: { value: "thread-secret", sensitive: true },
    OPENAI_BASE_URL: { value: `http://127.0.0.1:${server.address().port}/v1`, sensitive: false },
  });
  const file = join(root, "llm.json");
  await writeFile(
    file,
    JSON.stringify({
      schemaVersion: 1,
      name: "llm-env-test",
      fields: { answer: { output: true } },
      steps: [
        {
          type: "call",
          target: "llm.openai",
          inputs: { input: "hello" },
          outputs: { result: "$answer" },
        },
      ],
    }),
  );
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL("../dist/index.js", import.meta.url)),
    "run",
    file,
    "--storage-dir",
    root,

    "--json",
  ]);
  assert.deepEqual(JSON.parse(stdout).result, { answer: "ok" });
  assert.equal(requests[0].headers.authorization, "Bearer thread-secret");
  assert.equal(requests[0].body.model, "thread-model");
  assert.doesNotMatch(stdout + stderr, /thread-secret/);
  const automatic = JSON.parse(await readFile(file, "utf8"));
  automatic.steps[0].target = "llm.auto";
  automatic.steps.unshift({
    type: "call",
    target: "env.override",
    inputs: { name: "OPENAI_MODEL", value: "runtime-model", sensitive: false },
  });
  await writeFile(file, JSON.stringify(automatic));
  const autoResult = await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL("../dist/index.js", import.meta.url)),
    "run",
    file,
    "--storage-dir",
    root,

    "--json",
  ]);
  assert.deepEqual(JSON.parse(autoResult.stdout).result, { answer: "ok" });
  assert.equal(requests[1].headers.authorization, "Bearer thread-secret");
  assert.equal(requests[1].body.model, "runtime-model");
});

test("CLI environment persists, scopes across child flows, and masks trace/output without changing execution", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agent-env-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const run = (args) => {
    const processResult = spawnSync(
      process.execPath,
      [cli, ...args, "--storage-dir", root, "--json"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(processResult.status, 0, processResult.stdout + processResult.stderr);
    return JSON.parse(processResult.stdout).result;
  };
  run(["env", "set", "TOKEN", "global-demo", "--sensitive"]);

  assert.equal(run(["env", "list"]).TOKEN.value, "[sensitive]");
  const child = {
    schemaVersion: 1,
    name: "child",
    fields: { token: { sensitive: true, output: true } },
    steps: [
      { type: "call", target: "env.get", inputs: { name: "TOKEN" }, outputs: { value: "$token" } },
    ],
  };
  await writeFile(join(root, "child.json"), JSON.stringify(child));
  const flow = {
    schemaVersion: 1,
    name: "root",
    imports: { child: "./child.json" },
    fields: { token: { sensitive: true, output: true }, match: { output: true } },
    steps: [
      { type: "call", target: "child", outputs: { token: "$token" } },
      { type: "equal", left: "$token", right: "global-demo", output: "$match" },
    ],
  };
  await writeFile(join(root, "root.json"), JSON.stringify(flow));
  const tracePath = join(root, "run.jsonl");
  const output = run([
    "run",
    "root.json",

    "--trace",
    tracePath,
    "--trace-values",
  ]);
  assert.deepEqual(output, { token: "[sensitive]", match: true });
  const trace = await readFile(tracePath, "utf8");
  assert.doesNotMatch(trace, /thread-demo|global-demo/);
  assert.match(trace, /\[sensitive\]/);
  run(["env", "delete", "TOKEN"]);
  assert.equal(run(["run", "root.json"]).match, false);
});
