import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { createScriptTools, SCRIPT_TOOL_DEFINITION } from "../dist/script-runner.js";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args, "--json"], { encoding: "utf8", timeout: 10_000 });

test("distributed JSON/YAML groups retain metadata in inspect and real paths in trace", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "agent-groups-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const flow = {
    schemaVersion: 1,
    name: "Grouped",
    fields: [
      {
        type: "group",
        name: "Interface",
        description: "Fields",
        collapsed: true,
        fields: [
          { name: "input", input: true },
          { name: "result", output: true },
        ],
      },
    ],
    steps: [
      {
        type: "group",
        name: "Work",
        description: "Steps",
        collapsed: true,
        steps: [{ type: "set", field: "$result", value: "$input" }],
      },
    ],
  };
  for (const format of ["json", "yaml"]) {
    const file = join(directory, `flow.${format}`);
    writeFileSync(file, format === "json" ? JSON.stringify(flow) : stringify(flow));
    const inspected = run("inspect", file);
    assert.equal(inspected.status, 0, inspected.stderr);
    const inspection = JSON.parse(inspected.stdout).result;
    assert.equal(inspection.fields[0].collapsed, true);
    assert.equal(inspection.steps[0].name, "Work");
    const trace = join(directory, `${format}.jsonl`);
    const result = run("run", file, "--set", "input=hello", "--trace", trace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /hello/);
    const events = readFileSync(trace, "utf8").trim().split("\n").map(JSON.parse);
    const serialized = JSON.stringify(events);
    assert.match(serialized, /steps\[0\]\.steps\[0\]/);
    assert.doesNotMatch(serialized, /"type":"group"/);
  }
});

test("script tool exposes its dynamic JSON return contract without running a Worker", () => {
  const tools = createScriptTools(() => {
    throw Error("must not execute");
  });
  assert.equal(tools["script.run"].definition, SCRIPT_TOOL_DEFINITION);
  assert.equal(tools["script.run"].definition.returns.valueType, "JSON");
  assert.deepEqual(tools["script.run"].definition.outputs, []);
});
