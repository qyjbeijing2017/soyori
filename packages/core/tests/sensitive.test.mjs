import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntime,
  fieldDefinitions,
  parseFlow,
  redactFields,
  withoutSensitiveInitials,
} from "../dist/index.js";

test("sensitive metadata validates but leaves identity, execution and returns unchanged", async () => {
  const initial = { nested: "secret" };
  const flow = {
    schemaVersion: 1,
    name: "sensitive",
    fields: [
      {
        type: "group",
        name: "config",
        fields: [
          { name: "token", initial, sensitive: true, output: true },
          { name: "visible", initial: 3 },
        ],
      },
    ],
    steps: [],
  };
  const runtime = createRuntime(flow);
  await runtime.run();
  assert.deepEqual(runtime.getState().output.token, initial);
  const raw = runtime.getState().fields;
  const display = redactFields(raw, runtime.getSensitiveFields());
  assert.equal(display.token, "[sensitive]");
  assert.equal(display.visible, 3);
  let reads = 0;
  const accessor = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() {
      reads++;
      return "secret";
    },
  });
  assert.equal(redactFields(accessor, ["secret"]).secret, "[sensitive]");
  assert.equal(redactFields(accessor, []).secret, "[accessor]");
  assert.equal(reads, 0);
  assert.notEqual(raw.token, "[sensitive]");
  const exported = withoutSensitiveInitials(parseFlow(flow));
  assert.equal(exported.fields[0].type, "group");
  assert.equal(Object.hasOwn(fieldDefinitions(exported.fields).token, "initial"), false);
  assert.equal(fieldDefinitions(exported.fields).visible.initial, 3);
  assert.deepEqual(fieldDefinitions(flow.fields).token.initial, initial);
  assert.throws(() => parseFlow({ ...flow, fields: { token: { sensitive: "yes" } } }), /boolean/);
});
