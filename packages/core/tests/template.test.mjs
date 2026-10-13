import assert from "node:assert/strict";
import test from "node:test";
import { createRuntime, parseFlow } from "../dist/index.js";

const flow = (template, values = {}) => ({
  schemaVersion: 1,
  name: "template",
  fields: {
    ...Object.fromEntries(Object.entries(values).map(([name, initial]) => [name, { initial }])),
    result: { output: true },
  },
  steps: [{ type: "template", template, output: "$result" }],
});
async function render(template, values) {
  return (await createRuntime(flow(template, values)).run()).output.result;
}
test("templates retain whitespace, escape dollars, resolve paths and never reparse inserted values", async () => {
  assert.equal(
    await render("  Hello $user.name$!\r\n$items[0]$ / $$99 / $$name$$ / $raw$\n", {
      user: { name: "Ada" },
      items: [3],
      raw: "$missing$",
    }),
    "  Hello Ada!\r\n3 / $99 / $name$ / $missing$\n",
  );
  assert.equal(await render("$a$$b$", { a: "A", b: "B" }), "AB");
  assert.equal(await render('$data["a$b"]$', { data: { a$b: "yes" } }), "yes");
  assert.equal(await render(""), "");
});
test("templates render YAML values and indent standalone multiline replacements", async () => {
  assert.equal(
    await render("data:\n  $data$\nend", { data: { count: 2, keys: ["a", "b"] } }),
    "data:\n  count: 2\n  keys:\n    - a\n    - b\nend",
  );
  assert.equal(await render("  $text$\r\n", { text: "a\r\nb" }), "  a\r\n  b\r\n");
  assert.equal(await render("$a$/$b$/$c$", { a: 0, b: false, c: null }), "0/false/null");
  assert.equal(await render("before $text$ after", { text: "a\nb" }), "before a\nb after");
});
test("templates reject malformed or unsafe paths and infer referenced roots", async () => {
  for (const text of ["$oops", "$user..name$", "$user.__proto__$", "$x\n$", "$ $"])
    assert.throws(() => parseFlow(flow(text)), { code: "INVALID_FLOW" });
  assert.ok(parseFlow(flow("$missing.name$")).fields.missing);
  const runtime = createRuntime(flow("$missing.name$"));
  const state = await runtime.run();
  assert.equal(state.status, "completed");
  assert.equal(state.output.result, "");
  assert.equal(state.fields.missing, undefined);
  assert.throws(
    () => parseFlow({ ...flow(""), steps: [{ type: "concat", inputs: [], output: "$result" }] }),
    { code: "INVALID_FLOW" },
  );
});
