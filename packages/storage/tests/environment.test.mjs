import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime } from "soyori-core";
import {
  createEnvironmentTools,
  effectiveEnvironment,
  environmentKey,
  loadEnvironment,
  readEnvironment,
  saveEnvironment,
} from "../dist/environment.js";

function storage() {
  const values = new Map();
  return {
    read: async (key) => ({ found: values.has(key), value: values.get(key) }),
    write: async (key, value) => {
      values.set(key, structuredClone(value));
      return { key };
    },
  };
}
test("thread overrides including empty values, global fallback and per-run snapshots", async () => {
  const store = storage();
  await saveEnvironment(store, {
    TOKEN: { value: "global-token", sensitive: true },
    REGION: { value: "cn", sensitive: false },
  });
  await saveEnvironment(store, { TOKEN: { value: "", sensitive: true } }, "thread-a");
  const values = await effectiveEnvironment(store, "thread-a");
  assert.equal(values.TOKEN.value, "");
  assert.equal(values.REGION.value, "cn");
  assert.equal((await effectiveEnvironment(store, "thread-b")).TOKEN.value, "global-token");
  const tools = createEnvironmentTools(values);
  values.TOKEN.value = "changed";
  assert.deepEqual(tools["env.get"]({ name: "TOKEN" }), { found: true, value: "" });
  assert.deepEqual(tools["env.get"]({ name: "MISSING" }), { found: false, value: null });
  assert.throws(() => tools["env.get"]({ name: "constructor" }), /ENV_NAME/);
  assert.throws(() => environmentKey("../other"), /ENV_THREAD/);
  assert.throws(() => readEnvironment({ KEY: { value: 2, sensitive: true } }), /ENV_DATA/);
  assert.deepEqual(await loadEnvironment(store, "missing"), {});
});

test("file test overrides are isolated from threads and other files, with global fallback", async () => {
  const store = storage();
  await saveEnvironment(store, {
    TOKEN: { value: "global", sensitive: true },
    REGION: { value: "cn", sensitive: false },
  });
  await saveEnvironment(store, { TOKEN: { value: "thread", sensitive: true } }, "same-id");
  await saveEnvironment(store, { TOKEN: { value: "file", sensitive: true } }, undefined, "same-id");
  assert.equal((await effectiveEnvironment(store, "same-id")).TOKEN.value, "thread");
  assert.equal((await effectiveEnvironment(store, undefined, "same-id")).TOKEN.value, "file");
  assert.equal(
    (await effectiveEnvironment(store, undefined, "another-file")).TOKEN.value,
    "global",
  );
  assert.equal((await effectiveEnvironment(store, undefined, "same-id")).REGION.value, "cn");
  assert.throws(() => environmentKey("thread", "file"), /ENV_SCOPE/);
});
test("env.get is shared by nested flows, returns original values without marking destination", async () => {
  const child = {
    schemaVersion: 1,
    name: "child",
    fields: { token: { output: true } },
    steps: [
      { type: "call", target: "env.get", inputs: { name: "TOKEN" }, outputs: { value: "$token" } },
    ],
  };
  const runtime = createRuntime(
    {
      definition: {
        schemaVersion: 1,
        name: "root",
        fields: { token: { output: true } },
        steps: [{ type: "call", target: "child", outputs: { token: "$token" } }],
      },
      imports: new Map([["child", { definition: child, imports: new Map() }]]),
    },
    {},
    { functions: createEnvironmentTools({ TOKEN: { value: "secret", sensitive: true } }) },
  );
  await runtime.run();
  assert.equal(runtime.getState().output.token, "secret");
  assert.deepEqual(runtime.getSensitiveFields(), []);
});
