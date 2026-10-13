import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { saveEnvironment } from "soyori-storage/environment";
import { createFileStorage } from "soyori-storage/node";

test("CLI overrides system/global; thread input does not select environment; child loads relative JSON", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agent-env-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const name = "SOYORI_ENV_TEST_VALUE";
  const store = createFileStorage(join(root, ".environment"));
  await saveEnvironment(store, { [name]: { value: "global", sensitive: true } });
  await saveEnvironment(store, { [name]: { value: "wrong-thread", sensitive: true } }, "a");
  const run = (args, systemValue = "system") => {
    const response = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/index.js", import.meta.url)),
        ...args,
        "--storage-dir",
        root,
        "--json",
      ],
      { cwd: root, encoding: "utf8", env: { ...process.env, [name]: systemValue } },
    );
    const reply = JSON.parse(response.stdout);
    if (!args.includes("invalid")) assert.equal(response.status, 0, response.stdout);
    return { ...response, reply };
  };
  const flow = {
    schemaVersion: 1,
    name: "root",
    fields: { value: { sensitive: true }, match: { output: true }, threadId: { input: true } },
    steps: [
      { type: "call", target: "env.get", inputs: { name }, outputs: { value: "$value" } },
      { type: "equal", left: "$value", right: "system", output: "$match" },
    ],
  };
  await writeFile(join(root, "flow.json"), JSON.stringify(flow));
  assert.equal(
    run(["run", "flow.json", "--input-json", '{"threadId":"a"}']).reply.result.match,
    true,
  );
  flow.steps[1].right = "temporary=a=b";
  await writeFile(join(root, "flow.json"), JSON.stringify(flow));
  assert.equal(
    run(["run", "flow.json", "--env", `${name}=first`, "--env", `${name}=temporary=a=b`]).reply
      .result.match,
    true,
  );
  assert.equal(run(["run", "flow.json", "--env", "invalid"]).status, 1);
  await mkdir(join(root, "child"));
  await writeFile(join(root, "child", "env.json"), JSON.stringify({ [name]: "loaded" }));
  const child = {
    ...flow,
    name: "child",
    steps: [
      { type: "call", target: "env.load", inputs: { path: "./env.json" } },
      { type: "call", target: "env.override", inputs: { name, value: "final" } },
      ...flow.steps,
    ],
  };
  child.steps.at(-1).right = "final";
  await writeFile(join(root, "child", "main.json"), JSON.stringify(child));
  flow.imports = { child: "./child/main.json" };
  flow.steps = [
    { type: "call", target: "child", outputs: { match: "$match" } },
    { type: "call", target: "env.get", inputs: { name }, outputs: { value: "$value" } },
    { type: "equal", left: "$value", right: "final", output: "$match" },
  ];
  await writeFile(join(root, "flow.json"), JSON.stringify(flow));
  const response = run(["run", "flow.json"]);
  assert.equal(response.status, 0, response.stdout);
  assert.equal(response.reply.result.match, true);
  assert.equal(run(["env", "list"]).reply.result[name].source, "system");
});
