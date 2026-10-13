import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TraceWriter } from "../dist/trace.js";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const cwd = fileURLToPath(new URL("../", import.meta.url));
const run = (args, input) =>
  spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", input, timeout: 10_000 });
function fixture(t, code, fields = { result: { output: true } }, inputs = {}) {
  const directory = mkdtempSync(join(tmpdir(), "agent-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const module = join(directory, "functions.mjs");
  const flow = join(directory, "flow.json");
  writeFileSync(module, code);
  writeFileSync(
    flow,
    JSON.stringify({
      schemaVersion: 1,

      name: "Test",
      fields,
      steps: [{ type: "call", target: "work", inputs, output: "$result" }],
    }),
  );
  return { directory, flow, module, args: ["run", flow, "--functions", module] };
}
function records(path) {
  return readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
}

test("inline and stdin inputs use the same versioned result protocol", () => {
  for (const [args, input] of [
    [["--input-json", '{"count":5}'], undefined],
    [["--input", "-"], '{"count":5}'],
  ]) {
    const result = run(["run", "examples/add-one.json", ...args, "--json"], input);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { version: 1, ok: true, result: { count: 6 } });
  }
});

test("invalid arguments and input failures return machine errors", () => {
  for (const args of [
    ["run", "examples/add-one.json", "--input", "x", "--input-json", "{}"],
    ["run", "examples/add-one.json", "--input-json", "[]"],
    ["run", "examples/add-one.json", "--input-json", "{"],
    ["run", "examples/add-one.json", "--timeout", "0"],
    ["run", "examples/add-one.json", "--trace-values"],
    ["run", "missing.json"],
    ["unknown"],
  ]) {
    const result = run([...args, "--json"]);
    assert.equal(result.status, 1, JSON.stringify(result));
    const reply = JSON.parse(result.stdout);
    assert.equal(reply.version, 1);
    assert.equal(reply.ok, false);
    assert.equal(typeof reply.error.code, "string");
  }
});

test("inspect reports unresolved requirements without loading host code", () => {
  const result = run(["inspect", "examples/function.json", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(result.stdout).result;
  assert.equal(info.references[0].target, "greet");
  assert.equal(info.fields.message.output, true);
});

test("validate resolves subflows and functions without invoking nodes", (t) => {
  const f = fixture(t, 'export default { work() { throw new Error("must not run"); } };');
  const result = run(["validate", f.flow, "--functions", f.module, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).result.valid, true);
  const missing = run(["validate", f.flow, "--json"]);
  assert.equal(JSON.parse(missing.stdout).error.code, "INVALID_FLOW");
});

test("module-load logs and host stdout cannot corrupt JSON results", (t) => {
  const f = fixture(
    t,
    `import { writeSync } from "node:fs";
console.log("module log");
export default { work() { console.log("call log"); writeSync(1, "direct write\\n"); return 42; } };`,
  );
  const result = run([...f.args, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).result.result, 42);
  assert.match(result.stderr, /module log/);
  assert.match(result.stderr, /call log/);
  assert.match(result.stderr, /direct write/);
});

test("nested execution errors retain the child origin and full call stack", (t) => {
  const f = fixture(t, 'export default { work() { throw new Error("child failed"); } };');
  const parent = join(f.directory, "parent.json");
  writeFileSync(
    parent,
    JSON.stringify({
      schemaVersion: 1,

      name: "Parent",
      fields: {},
      steps: [{ type: "call", target: "test" }],
    }),
  );
  const result = run([
    "run",
    parent,
    "--flows",
    `test=${f.flow}`,
    "--functions",
    f.module,
    "--json",
  ]);
  const error = JSON.parse(result.stdout).error;
  assert.equal(result.status, 1);
  assert.equal(error.code, "EXECUTION_ERROR");
  assert.equal(error.flowName, "Test");
  assert.deepEqual(
    error.callStack.map((frame) => frame.flowName),
    ["Parent", "Test"],
  );
});

test("host exceptions retain runtime location", (t) => {
  const f = fixture(t, 'export default { work() { throw new Error("failed call"); } };');
  const result = run([...f.args, "--json"]);
  const error = JSON.parse(result.stdout).error;
  assert.equal(error.code, "EXECUTION_ERROR");
  assert.equal(error.flowName, "Test");
  assert.equal(error.path, "steps[0]");
  assert.equal(error.callStack.length, 1);
});

test("toJSON and getters are not invoked during output encoding", (t) => {
  for (const expression of [
    'Object.defineProperty({ a: 1 }, "toJSON", { value() { throw new Error("hook ran"); } })',
    'Object.defineProperty({}, "a", { enumerable: true, get() { throw new Error("getter ran"); } })',
  ]) {
    const f = fixture(t, `export default { work() { return ${expression}; } };`);
    const result = run([...f.args, "--json"]);
    assert.equal(JSON.parse(result.stdout).error.code, "OUTPUT_NOT_JSON");
  }
});

test("trace records complete stack transitions including child return writes", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-cli-trace-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "trace.jsonl");
  const result = run([
    "run",
    "examples/parent.json",
    "--input-json",
    '{"count":2}',
    "--trace",
    path,
    "--trace-values",
    "--json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const events = records(path);
  assert.deepEqual(
    events.map((e) => e.sequence),
    events.map((_, i) => i),
  );
  assert.equal(events.at(-1).type, "end");
  const steps = events.filter((e) => e.type === "step-end");
  assert.equal(steps[0].stack.length, 2);
  assert.equal(steps.at(-1).executed.flowName, "加一");
  assert.equal(steps.at(-1).stack[0].fields.entries.find(([key]) => key === "count")[1], 3);
});

test("trace captures in-place mutations and defaults to omitting field values", (t) => {
  const f = fixture(
    t,
    'export default { work({ data }) { data.secret = "mutated"; return 1; } };',
    { data: { initial: { secret: "original" } }, result: { output: true } },
    { data: "$data" },
  );
  const path = join(f.directory, "trace.jsonl");
  assert.equal(run([...f.args, "--trace", path, "--trace-values", "--json"]).status, 0);
  const events = records(path);
  assert.match(JSON.stringify(events.find((e) => e.type === "initial")), /original/);
  assert.match(JSON.stringify(events.find((e) => e.type === "step-end")), /mutated/);
  const privatePath = join(f.directory, "private.jsonl");
  assert.equal(run([...f.args, "--trace", privatePath, "--json"]).status, 0);
  assert.doesNotMatch(readFileSync(privatePath, "utf8"), /original|mutated|secret/);
});

test("trace retains intermediate invocations when multiple subflows return together", (t) => {
  const f = fixture(t, "export default { work() { return 42; } };");
  const middle = join(f.directory, "middle.json");
  const parent = join(f.directory, "parent.json");
  writeFileSync(
    middle,
    JSON.stringify({
      schemaVersion: 1,

      name: "Middle",
      imports: { test: "./flow.json" },
      fields: {},
      steps: [{ type: "call", target: "test", outputs: { result: "$hidden" } }],
    }),
  );
  writeFileSync(
    parent,
    JSON.stringify({
      schemaVersion: 1,

      name: "Parent",
      fields: {},
      steps: [{ type: "call", target: "middle" }],
    }),
  );
  const path = join(f.directory, "trace.jsonl");
  const result = run([
    "run",
    parent,
    "--flows",
    `middle=${middle}`,
    "--functions",
    f.module,
    "--trace",
    path,
    "--trace-values",
    "--json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const event = records(path)
    .filter((item) => item.type === "step-end")
    .at(-1);
  assert.deepEqual(
    event.returned.map((item) => item.flowName),
    ["Middle", "Test"],
  );
  assert.equal(event.returned[0].fields.entries.find(([key]) => key === "hidden")[1], 42);
});

test("trace file failures are explicit and existing files are not overwritten", async (t) => {
  const f = fixture(t, "export default { work() { return 1; } };");
  const path = join(f.directory, "trace.jsonl");
  writeFileSync(path, "keep");
  const result = run([...f.args, "--trace", path, "--json"]);
  assert.equal(JSON.parse(result.stdout).error.code, "TRACE_OPEN_ERROR");
  assert.equal(readFileSync(path, "utf8"), "keep");
  const writer = await TraceWriter.create(join(f.directory, "closed.jsonl"));
  await writer.close();
  await assert.rejects(writer.write({ type: "test" }), { code: "TRACE_WRITE_ERROR" });
});

test("timeout terminates synchronous host code and finalizes trace", (t) => {
  const f = fixture(t, "export default { work() { while (true) {} } };");
  const path = join(f.directory, "trace.jsonl");
  // Allow startup under parallel suite load so this tests termination inside the step.
  const result = run([...f.args, "--timeout", "3s", "--trace", path, "--json"]);
  assert.equal(result.status, 124, result.stderr);
  assert.equal(JSON.parse(result.stdout).error.code, "TIMEOUT");
  const events = records(path);
  assert.equal(events.at(-1).error.code, "TIMEOUT");
  assert.ok(events.some((e) => e.type === "step-start"));
});

test("timeout covers module import and unresolved promises", (t) => {
  for (const code of [
    "while (true) {}",
    "export default { work() { return new Promise(() => {}); } };",
  ]) {
    const f = fixture(t, code);
    const result = run([...f.args, "--timeout", "500ms", "--json"]);
    assert.equal(result.status, 124, result.stderr);
  }
});

test("unexpected process exit produces a machine failure", (t) => {
  const f = fixture(t, "export default { work() { process.exit(0); } };");
  const result = run([...f.args, "--json"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error.code, "WORKER_EXIT");
});

test("SIGINT stops execution with a structured interrupted result", {
  skip: process.platform === "win32",
}, async (t) => {
  const f = fixture(
    t,
    'export default { work() { console.error("ready"); return new Promise(() => {}); } };',
  );
  const child = spawn(process.execPath, [cli, ...f.args, "--json"], { cwd });
  t.after(() => child.kill("SIGKILL"));
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  await once(child.stderr, "data");
  child.kill("SIGINT");
  const [code] = await once(child, "close");
  assert.equal(code, 130);
  assert.equal(JSON.parse(output).error.code, "INTERRUPTED");
});

test("run and validate reject import names that collide with registered tools", (t) => {
  const f = fixture(t, 'export default { work() { throw new Error("must not run"); } };');
  const source = JSON.parse(readFileSync(f.flow, "utf8"));
  source.imports = { work: "./child.json" };
  writeFileSync(f.flow, JSON.stringify(source));
  writeFileSync(
    join(f.directory, "child.json"),
    JSON.stringify({ schemaVersion: 1, name: "Child", fields: {}, steps: [] }),
  );
  for (const command of ["run", "validate"]) {
    const result = run([command, f.flow, "--functions", f.module, "--json"]);
    assert.equal(result.status, 1);
    const error = JSON.parse(result.stdout).error;
    assert.equal(error.code, "INVALID_FLOW");
    assert.match(error.message, /conflicts/);
  }
});
