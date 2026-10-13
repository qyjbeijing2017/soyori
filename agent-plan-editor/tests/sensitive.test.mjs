import assert from "node:assert/strict";
import test from "node:test";
import { parseFlow } from "agent-plan-core";
import { parse } from "yaml";
import { observeChatTools } from "../src/chat-execution.ts";
import { exportFile } from "../src/export-file.ts";
import { createSession } from "../src/session.ts";

test("snapshots and exports mask explicitly sensitive fields without altering source or runtime", async () => {
  const flow = {
    schemaVersion: 1,
    name: "secret",
    fields: { token: { initial: "demo-secret", sensitive: true, output: true } },
    steps: [{ type: "set", field: "$token", value: "new-secret" }],
  };
  const session = createSession(parseFlow(flow), {});
  await session.step();
  assert.equal(session.runtime.getState().output.token, "new-secret");
  assert.doesNotMatch(JSON.stringify(session.records), /demo-secret|new-secret/);
  const content = new Blob([JSON.stringify(flow)]);
  const result = parse(await (await exportFile(content, "flow.json")).text());
  assert.equal(Object.hasOwn(result.fields.token, "initial"), false);
  assert.match(await content.text(), /demo-secret/);
});
test("tool recording hides env.get results and sensitive-flow arguments without changing results", async () => {
  const run = { entries: [], dropped: 0 };
  const registry = observeChatTools({ "env.get": () => ({ value: "secret" }) }, run, () => {});
  assert.deepEqual(await registry["env.get"]({ name: "KEY" }), { value: "secret" });
  assert.doesNotMatch(JSON.stringify(run), /"secret"/);
  const privateRun = { entries: [], dropped: 0 };
  const privateTools = observeChatTools(
    { custom: (input) => input },
    privateRun,
    () => {},
    () => true,
  );
  await privateTools.custom({ key: "secret" });
  assert.doesNotMatch(JSON.stringify(privateRun), /"secret"/);
});
