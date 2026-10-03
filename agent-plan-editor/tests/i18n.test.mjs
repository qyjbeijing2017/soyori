import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import i18n, { tr } from "../src/i18n.ts";
import { stepTitle } from "../src/step-model.ts";

test("bundled locales have matching keys and interpolation variables", () => {
  const read = (name) =>
    JSON.parse(readFileSync(new URL(`../src/locales/${name}.json`, import.meta.url), "utf8"));
  const zh = read("zh-CN"),
    en = read("en");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  const tokens = (value) => [...value.matchAll(/\{\{(.*?)\}\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(zh)) {
    assert.ok(en[key].trim(), key);
    assert.deepEqual(tokens(en[key]), tokens(zh[key]), key);
  }
});
test("language switches translate UI and interpolation without changing tool identifiers", async () => {
  await i18n.changeLanguage("en");
  assert.equal(tr("变量"), "Variables");
  assert.equal(tr("编辑 {{name}}", { name: "我的 flow" }), "Edit 我的 flow");
  assert.equal(stepTitle({ type: "call", target: "用户工具" }), "Call 用户工具");
  assert.equal(tr("unknown.future.key"), "unknown.future.key");
  await i18n.changeLanguage("zh-CN");
  assert.equal(tr("变量"), "变量");
  assert.equal(stepTitle({ type: "call", target: "用户工具" }), "调用 用户工具");
});
