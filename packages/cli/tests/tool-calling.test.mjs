import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("CLI executes imported tools and continues a failed call without interpreting model arguments", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-tool-calls-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const child = {
    schemaVersion: 1,
    name: "child",
    fields: { input: { input: true }, answer: { output: true } },
    steps: [{ type: "set", field: "$answer", value: "$input" }],
  };
  writeFileSync(join(dir, "child.json"), JSON.stringify(child));
  const root = {
    schemaVersion: 1,
    name: "root",
    imports: { "demo.echo": "./child.json" },
    fields: { result: { output: true }, messages: { output: true } },
    steps: [
      {
        type: "call",
        target: "tools.execute",
        inputs: {
          tools: ["storage.read", "demo.echo"],
          calls: [
            { id: "fail", target: "storage.read", inputs: { key: "INVALID" } },
            { id: "ok", target: "demo.echo", inputs: { input: "$literal" } },
          ],
        },
        outputs: { results: "$result" },
      },
    ],
  };
  writeFileSync(join(dir, "flow.json"), JSON.stringify(root));
  // Dollar strings in literal call operands must use the normal Core escape.
  root.steps[0].inputs.calls[1].inputs.input = "$$literal";
  root.steps.push(
    {
      type: "call",
      target: "memory.addUser",
      inputs: { input: "check" },
      outputs: { memory: "$messages" },
    },
    {
      type: "call",
      target: "memory.addAssistant",
      inputs: {
        memory: "$messages",
        message: { role: "assistant", content: "", toolCalls: root.steps[0].inputs.calls },
      },
      outputs: { memory: "$messages" },
    },
    {
      type: "call",
      target: "memory.addTools",
      inputs: { memory: "$messages", results: "$result" },
      outputs: { memory: "$messages" },
    },
  );
  writeFileSync(join(dir, "flow.json"), JSON.stringify(root));
  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const result = spawnSync(
    process.execPath,
    [cli, "run", join(dir, "flow.json"), "--storage-dir", join(dir, "data"), "--json"],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const reply = JSON.parse(result.stdout);
  assert.equal(reply.ok, true);
  assert.ok(reply.result.result[0].error);
  assert.deepEqual(reply.result.result[1].result, { answer: "$literal" });
  assert.equal(reply.result.messages.length, 4);
  assert.equal(reply.result.messages[2].toolCallId, "fail");
  assert.ok(JSON.parse(reply.result.messages[2].content).error);
  assert.deepEqual(JSON.parse(reply.result.messages[3].content), { answer: "$literal" });
});
