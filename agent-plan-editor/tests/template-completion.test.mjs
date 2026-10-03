import assert from "node:assert/strict";
import test from "node:test";
import { parseFlow } from "agent-plan-core";
import { templateCompletion } from "../src/template-completion.ts";

test("suggestions distinguish opening, closing and escaped dollars at the cursor", () => {
  for (const value of ["$name$", "$$", "cost $$99", "$a$$b$", "plain"])
    assert.equal(templateCompletion(value, value.length), null);
  assert.deepEqual(templateCompletion("Hello $cou", 10), { start: 6, end: 10, query: "cou" });
  assert.deepEqual(templateCompletion("$a$$b", 5), { start: 3, end: 5, query: "b" });
  assert.deepEqual(templateCompletion("before $count$ after", 11), {
    start: 7,
    end: 14,
    query: "cou",
  });
  assert.equal(templateCompletion("$bad\ntext", 9), null);
});
test("applying a template infers new roots but escaped names are not variables", () => {
  const flow = parseFlow({
    schemaVersion: 1,
    name: "template",
    fields: {},
    steps: [{ type: "template", template: "$newName$ $user.name$ $$literal$$", output: "$answer" }],
  });
  assert.deepEqual(Object.keys(flow.fields).sort(), ["answer", "newName", "user"]);
});
