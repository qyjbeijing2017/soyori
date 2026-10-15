import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const cases = [
  [
    "Chinese variants",
    ["zh", "zh-CN", "zh-TW", "zh-HK", "ZH-hant-TW"].map((language) => ({
      language,
      expected: "zh-CN",
    })),
  ],
  [
    "English and other languages",
    ["en", "en-US", "ja-JP", "fr"].map((language) => ({ language, expected: "en" })),
  ],
  [
    "preferred language",
    [
      { languages: ["fr", "zh-CN"], expected: "en" },
      { languages: ["zh"], language: "en", expected: "zh-CN" },
      { languages: [], language: "zh-HK", expected: "zh-CN" },
    ],
  ],
  [
    "saved preference",
    [
      { saved: "en", language: "zh", expected: "en" },
      { saved: "zh-CN", language: "en", expected: "zh-CN" },
      { saved: "zh-CN", noNavigator: true, expected: "zh-CN" },
    ],
  ],
  [
    "invalid preference",
    [
      { saved: "zh-TW", language: "zh-HK", expected: "zh-CN" },
      { saved: "fr", language: "en", expected: "en" },
      { saved: "", language: "ja", expected: "en" },
    ],
  ],
  [
    "unavailable storage",
    [
      { blocked: true, language: "zh-TW", expected: "zh-CN" },
      { blocked: true, language: "en", expected: "en" },
      { absentStorage: true, language: "zh", expected: "zh-CN" },
      { blocked: true, noNavigator: true, expected: "en" },
    ],
  ],
  ["no browser information", [{ noNavigator: true, expected: "en" }, { expected: "en" }]],
];

for (const [name, scenarios] of cases) {
  test(name, () => {
    for (const scenario of scenarios) {
      const script = `
        import assert from "node:assert/strict";
        const options = ${JSON.stringify(scenario)};
        const writes = [];
        Object.defineProperty(globalThis, "navigator", {
          configurable: true,
          value: options.noNavigator ? undefined : options,
        });
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          get() {
            if (options.blocked) throw new Error("Storage blocked");
            return options.absentStorage ? undefined : {
              getItem(key) {
                assert.equal(key, "agent-plan.language");
                return options.saved ?? null;
              },
              setItem(key, value) { writes.push([key, value]); },
            };
          },
        });
        globalThis.document = { documentElement: { lang: "en" } };
        const { default: i18n, tr } = await import(${JSON.stringify(new URL("../src/i18n.ts", import.meta.url).href)});
        assert.equal(i18n.language, options.expected);
        assert.equal(document.documentElement.lang, options.expected);
        assert.equal(tr("字段"), options.expected === "en" ? "Fields" : "字段");
        assert.deepEqual(writes, [], "automatic detection must not save a manual preference");
        for (const language of ["zh-CN", "en"]) {
          await i18n.changeLanguage(language);
          assert.equal(document.documentElement.lang, language);
          assert.equal(tr("字段"), language === "en" ? "Fields" : "字段");
        }
        assert.deepEqual(writes, options.blocked || options.absentStorage ? [] : [
          ["agent-plan.language", "zh-CN"], ["agent-plan.language", "en"],
        ]);
      `;
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(
        result.status,
        0,
        `${JSON.stringify(scenario)}: ${result.stderr || result.error?.message}`,
      );
    }
  });
}

test("HTML starts with the no-browser fallback language", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="en">/);
});
