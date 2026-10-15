import assert from "node:assert/strict";
import test from "node:test";
import { callTargetGroups } from "../src/call-tools.ts";
import i18n from "../src/i18n.ts";
import { libraryChoices } from "../src/library-calls.ts";

for (const [language, globalLabel] of [
  ["en", "Global"],
  ["zh-CN", "全局"],
]) {
  test(`call groups preserve namespaces and current document aliases in ${language}`, async () => {
    await i18n.changeLanguage(language);
    const current = {
      id: "current",
      flow: {
        schemaVersion: 1,
        name: "Renamed",
        fields: {},
        steps: [],
        imports: {
          "custom.nested.self": "library:current",
          "storage.custom": "library:other",
        },
      },
    };
    const other = { id: "other", flow: { ...current.flow, name: "Other", imports: {} } };
    const global = { id: "global", flow: { ...other.flow, name: "Plain" } };
    const choices = libraryChoices(current.flow, [current, other, global], current.id);
    const groups = callTargetGroups(choices, "missing.target");
    assert.deepEqual(
      groups.find((g) => g.group === "llm").items.map(({ value, label }) => ({ value, label })),
      [
        { value: "llm.local", label: "local" },
        { value: "llm.openai", label: "openai" },
        { value: "llm.anthropic", label: "anthropic" },
        { value: "llm.auto", label: "auto" },
      ],
    );
    const self = groups.find((g) => g.group === "custom").items[0];
    assert.equal(self.value, "custom.nested.self");
    assert.equal(self.label, "nested.self");
    assert.equal(choices.find((choice) => choice.alias === self.value).current, true);
    assert.ok(
      groups.find((g) => g.group === "storage").items.some((i) => i.value === "storage.read"),
    );
    assert.ok(
      groups.find((g) => g.group === "storage").items.some((i) => i.value === "storage.custom"),
    );
    assert.equal(
      groups.find((g) => g.group === globalLabel).items.find((i) => i.value === "Plain").value,
      "Plain",
    );
    assert.equal(
      groups.find((g) => g.group === globalLabel).items.find((i) => i.value === "Plain").label,
      "Plain",
    );
    assert.equal(
      groups.find((g) => g.group === "storage").items.find((i) => i.value === "storage.read").label,
      "read",
    );
    assert.equal(groups.find((g) => g.group === "missing").items[0].disabled, true);
    assert.equal(current.flow.imports["custom.nested.self"], "library:current");
  });
}
