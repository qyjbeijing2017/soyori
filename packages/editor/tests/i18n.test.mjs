import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toolDefinitions } from "../src/call-tools.ts";
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
  assert.equal(tr("字段"), "Fields");
  assert.equal(tr("步骤"), "Steps");
  assert.equal(tr("环境变量名"), "Environment variable name");
  assert.equal(tr("编辑 {{name}}", { name: "我的 flow" }), "Edit 我的 flow");
  assert.equal(stepTitle({ type: "call", target: "用户工具" }), "Call 用户工具");
  assert.equal(tr("unknown.future.key"), "unknown.future.key");
  await i18n.changeLanguage("zh-CN");
  assert.equal(tr("字段"), "字段");
  assert.equal(tr("步骤"), "步骤");
  assert.equal(stepTitle({ type: "call", target: "用户工具" }), "调用 用户工具");
});

test("built-in parameter help has English translations", () => {
  const en = JSON.parse(readFileSync(new URL("../src/locales/en.json", import.meta.url), "utf8"));
  function check(entries) {
    for (const entry of entries ?? []) {
      for (const value of [
        entry.description,
        entry.placeholder,
        entry.type === "group" ? entry.name : undefined,
      ]) {
        if (value && /\p{Script=Han}/u.test(value)) {
          assert.ok(Object.hasOwn(en, value), `Missing built-in help translation: ${value}`);
          assert.doesNotMatch(en[value], /\p{Script=Han}/u, value);
        }
      }
      if (entry.type === "group") check(entry.fields);
    }
  }
  for (const definition of Object.values(toolDefinitions)) {
    check(definition.inputs);
    check(definition.outputs);
  }
});
