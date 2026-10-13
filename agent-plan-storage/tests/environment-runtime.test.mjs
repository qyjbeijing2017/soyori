import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeEnvironment, parseEnvironmentFile } from "../dist/environment.js";

test("runtime overrides/load are atomic, live, nonpersistent and return only names", async () => {
  const initial = { KEY: { value: "old", sensitive: true } };
  const environment = createRuntimeEnvironment(initial, async (path) =>
    path === "good.json"
      ? '{"KEY":"loaded","REGION":{"value":"cn","sensitive":false}}'
      : '{"KEY":"new","BAD":{"value":42}}',
  );
  const response = await environment.tools["env.override"]({ name: "KEY", value: "secret" });
  assert.deepEqual(response, { success: true, names: ["KEY"] });
  assert.equal(environment.strings().KEY, "secret");
  assert.equal(initial.KEY.value, "old");
  await assert.rejects(environment.tools["env.load"]({ path: "bad.json" }));
  assert.equal(environment.strings().KEY, "secret");
  await environment.tools["env.load"]({ path: "good.json" });
  assert.equal(environment.strings().KEY, "loaded");
  assert.equal((await environment.tools["env.get"]({ name: "REGION" })).value, "cn");
  assert.equal(environment.values.KEY.sensitive, true);
  assert.throws(() =>
    environment.tools["env.override"]({ name: "KEY", value: "x", sensitive: false }),
  );
  assert.throws(() => parseEnvironmentFile('{"secret":broken}'), /ENV_FILE_FORMAT/);
});
