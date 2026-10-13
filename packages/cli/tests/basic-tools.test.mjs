import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
test("CLI registers date, web and basic libraries and exposes them to tool execution", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "agent-basic-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("local page");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const flow = {
    schemaVersion: 1,
    name: "basic",
    fields: {
      clock: { output: true },
      text: { output: true },
      number: { output: true },
      items: { output: true },
      tools: { output: true },
      memory: { output: true },
    },
    steps: [
      {
        type: "call",
        target: "memory.init",
        inputs: { threadId: "test", prefix: "test-memory", system: "system", prompt: "hello" },
        outputs: { memory: "$memory" },
      },
      {
        type: "call",
        target: "memory.save",
        inputs: { threadId: "test", prefix: "test-memory", memory: "$memory" },
      },
      {
        type: "call",
        target: "memory.init",
        inputs: { threadId: "test", prefix: "test-memory", prompt: "again" },
        outputs: { memory: "$memory" },
      },
      { type: "call", target: "time.now", inputs: { timeZone: "UTC" }, outputs: { iso: "$clock" } },
      {
        type: "call",
        target: "web.fetch",
        inputs: { url: `http://127.0.0.1:${server.address().port}/` },
        outputs: { body: "$text" },
      },
      {
        type: "call",
        target: "math.clamp",
        inputs: { value: 10, min: 0, max: 3 },
        outputs: { result: "$number" },
      },
      {
        type: "call",
        target: "array.concat",
        inputs: { arrays: [[1], [2, 3]] },
        outputs: { result: "$items" },
      },
      {
        type: "call",
        target: "tools.execute",
        inputs: {
          calls: [
            { id: "trim", target: "text.trim", inputs: { text: " hello " } },
            { id: "search", target: "web.search", inputs: { query: "" } },
          ],
        },
        outputs: { results: "$tools" },
      },
    ],
  };
  const path = join(dir, "flow.json");
  await writeFile(path, JSON.stringify(flow));
  const result = await execute(
    process.execPath,
    [
      fileURLToPath(new URL("../dist/index.js", import.meta.url)),
      "run",
      path,
      "--storage-dir",
      join(dir, "data"),
      "--json",
    ],
    { timeout: 10000 },
  );
  const reply = JSON.parse(result.stdout);
  assert.equal(reply.ok, true);
  assert.match(reply.result.clock, /^\d{4}-/);
  assert.equal(reply.result.text, "local page");
  assert.equal(reply.result.number, 3);
  assert.deepEqual(reply.result.items, [1, 2, 3]);
  assert.deepEqual(reply.result.memory, [
    { role: "system", content: "system" },
    { role: "user", content: "hello" },
    { role: "user", content: "again" },
  ]);
  assert.deepEqual(reply.result.tools[0].result, { result: "hello" });
  assert.equal(reply.result.tools[1].target, "web.search");
  assert.deepEqual(reply.result.tools[1].error, {
    message: "Tool execution failed or arguments/result were invalid.",
  });
});
