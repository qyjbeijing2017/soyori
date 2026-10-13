import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("CLI AI tools use step credentials, return JSON, validate without network and redact errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "agent-plan-ai-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).messages[0].content, "hello");
    assert.equal(req.headers.authorization, "Bearer test-secret");
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "test",
        object: "chat.completion",
        model: "test-model",
        choices: [
          { index: 0, message: { role: "assistant", content: "成功" }, finish_reason: "stop" },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const file = join(directory, "flow.json");
  await writeFile(
    file,
    JSON.stringify({
      schemaVersion: 1,
      name: "AI",
      fields: { apiKey: { input: true }, result: { output: true } },
      steps: [
        {
          type: "call",
          target: "llm.openai",
          inputs: {
            input: "hello",
            apiKey: "$apiKey",
            model: "test-model",
            baseURL: `http://127.0.0.1:${server.address().port}/v1`,
          },
          outputs: { result: "$result" },
        },
      ],
    }),
  );
  const run = (command, credentials = true) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../dist/index.js", import.meta.url)),
          command,
          file,
          "--json",
          "--input-json",
          JSON.stringify(credentials ? { apiKey: "test-secret" } : {}),
        ],
        {
          env: {
            ...process.env,
          },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  const validation = await run("validate", false);
  assert.equal(validation.code, 0, validation.stderr);
  assert.equal(calls, 0);
  const result = await run("run");
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, { result: "成功" });
  const failure = await run("run", false);
  assert.equal(failure.code, 1);
  assert.match(failure.stdout, /AI_CONFIG/);
  assert.ok(!failure.stdout.includes("test-secret"));
  assert.equal(calls, 1);
});
