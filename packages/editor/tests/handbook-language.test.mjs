import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRuntime, parseFlow } from "soyori-core";
import { createBasicTools } from "soyori-tools";
import { parseDocument } from "yaml";
import { createAssistantTools } from "../src/assistant-tools.ts";
import { createDocumentation, headings, localizeDocumentation } from "../src/documentation.ts";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const zh = JSON.parse(await read("docs/handbook/index.json"));
const en = JSON.parse(await read("docs/handbook/en/index.json"));
const blocks = (content) =>
  [...content.matchAll(/^```[^\n]*\n[\s\S]*?^```/gm)].map(([text]) => text);
function assertEnglish(text, source) {
  for (const sample of ["今天的天气很好。", "很高兴认识你。", "今日はとてもいい天気です。"])
    text = text.replaceAll(sample, "");
  assert.doesNotMatch(text, /\p{Script=Han}/u, `${source}: untranslated instructional text`);
}
function yaml(text) {
  const document = parseDocument(text, { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  assert.deepEqual(document.warnings, []);
  return document.toJS();
}

test("English covers every chapter, heading and example with localized instructions", async () => {
  assert.equal(en.version, zh.version);
  assert.deepEqual(
    en.chapters.map(({ id }) => id),
    zh.chapters.map(({ id }) => id),
  );
  assert.deepEqual(
    en.examples.map(({ title, ...example }) => example),
    zh.examples.map(({ title, ...example }) => example),
  );
  assert.equal(new Set(en.chapters.map(({ path }) => path)).size, en.chapters.length);
  for (const [index, chapter] of en.chapters.entries()) {
    const original = zh.chapters[index];
    const content = await read(chapter.path);
    const source = await read(original.path);
    assert.match(chapter.title, /^[A-Za-z]/);
    assert.match(chapter.summary, /^[A-Za-z]/);
    assert.deepEqual(chapter.examples, original.examples);
    assert.ok(content.startsWith(`# ${chapter.title}\n`), chapter.path);
    assert.equal(blocks(content).length, blocks(source).length, chapter.id);
    assertEnglish(content, chapter.path);
    for (const block of content.matchAll(/^```yaml\n([\s\S]*?)^```/gm)) {
      const definition = yaml(block[1]);
      const steps = Array.isArray(definition)
        ? definition
        : definition.template !== undefined
          ? [{ type: "template", output: "$snippet", ...definition }]
          : null;
      parseFlow(
        steps
          ? { schemaVersion: 1, name: "Snippet", fields: {}, steps }
          : { schemaVersion: 1, name: "Snippet", fields: {}, steps: [], ...definition },
      );
    }
    const sourceHeadings = headings(source);
    const translated = headings(content);
    assert.deepEqual(
      sourceHeadings.map(({ level }) => level),
      translated.map(({ level }) => level),
    );
    assert.deepEqual(
      sourceHeadings.map(({ id }) => chapter.sectionAliases[id]),
      translated.map(({ id }) => id),
    );
    assert.doesNotMatch(content, /\{\{(?:image|code):/, chapter.path);
    // Keep instructional prose English while allowing shared sample values and code.
    assert.doesNotMatch(
      content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, ""),
      /^#{1,6} .*\p{Script=Han}/mu,
    );
  }
});

test("localized downloadable flows preserve structure, paths and documented results", async () => {
  const localizable = new Set([
    "name",
    "description",
    "initial",
    "template",
    "code",
    "system",
    "prompt",
    "input",
    "text",
    "content",
    "value",
  ]);
  function structure(value, key) {
    if (Array.isArray(value)) return value.map((item) => structure(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, structure(child, name)]),
      );
    return typeof value === "string" && localizable.has(key) && !value.startsWith("$")
      ? "<localized>"
      : value;
  }
  for (const example of en.examples)
    for (const file of example.files) {
      const path = `docs/handbook/en/examples/${example.id}/${file}`;
      const content = await read(path);
      assertEnglish(content, path);
      if (!file.endsWith(".yaml")) continue;
      const original = parseFlow(yaml(await read(`docs/handbook/examples/${example.id}/${file}`)));
      const translated = parseFlow(yaml(content));
      assert.deepEqual(structure(translated), structure(original), path);
    }
  async function load(path) {
    const definition = parseFlow(yaml(await read(path)));
    const imports = new Map();
    for (const [alias, source] of Object.entries(definition.imports ?? {})) {
      imports.set(
        alias,
        await load(new URL(source, `https://examples.local/${path}`).pathname.slice(1)),
      );
    }
    return { definition, imports, source: path };
  }
  const functions = createBasicTools({ signal: new AbortController().signal });
  for (const [path, inputs, expected] of [
    ["hello/hello.yaml", { name: "Alex" }, { chatOut: "Hello, Alex!" }],
    ["counter/counter.yaml", {}, { count: 3 }],
    ["subflows/main.yaml", {}, { answer: 3 }],
    ["debugging/fixed.yaml", {}, { answer: 5 }],
    ["constants/constants.yaml", {}, { answer: 10 }],
    ["variables/variables.yaml", {}, { count: 3 }],
    ["objects/objects.yaml", {}, { items: [{ name: "Alex", price: 2 }] }],
    ["assignment/assignment.yaml", {}, { items: [[1, 2]] }],
    ["control/control.yaml", {}, { count: 3 }],
    ["text/text.yaml", {}, { message: "Hello, Alex! Price $99" }],
    ["math/math.yaml", {}, { total: 12 }],
    ["comparison/comparison.yaml", {}, { adult: true }],
    ["logic/logic.yaml", {}, { allowed: true }],
    ["calling/calling.yaml", {}, { clean: "Hello" }],
    ["groups/groups.yaml", {}, { answer: 3 }],
  ]) {
    const state = await createRuntime(await load(`docs/handbook/en/examples/${path}`), inputs, {
      functions,
    }).run();
    assert.equal(state.status, "completed", path);
    assert.deepEqual(state.output, expected, path);
  }
  const failed = await createRuntime(
    await load("docs/handbook/en/examples/debugging/broken.yaml"),
  ).run();
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "DIVISION_BY_ZERO");
  const translation = yaml(await read("docs/handbook/en/examples/translate/translate.yaml"));
  const cli = blocks(await read("docs/handbook/en/quick-start-cli.md")).at(-1);
  assert.deepEqual(yaml(cli.replace(/^```yaml\n|```$/g, "")), translation);
  for (const [id, chapter] of [
    ["quick-memory", "quick-start-memory"],
    ["quick-tools", "quick-start-tools"],
    ["quick-tools-agent", "quick-start-tools"],
    ["agent", "agents"],
  ]) {
    const entry = en.examples.find((example) => example.id === id);
    const flow = yaml(await read(`docs/handbook/en/examples/${id}/${entry.entry}`));
    const content = await read(en.chapters.find((entry) => entry.id === chapter).path);
    assert.ok(
      [...content.matchAll(/^```yaml\n([\s\S]*?)^```/gm)].some(
        (match) => JSON.stringify(yaml(match[1])) === JSON.stringify(flow),
      ),
      `${id}: downloadable example differs from chapter`,
    );
  }
});

test("English local links, section anchors and shared images resolve", async () => {
  const byUrl = new Map(en.chapters.map((entry) => [new URL(entry.path, root).href, entry]));
  for (const entry of en.chapters) {
    const content = await read(entry.path);
    for (const [match, href] of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:/i.test(href)) continue;
      const url = new URL(href, new URL(entry.path, root));
      const anchor = decodeURIComponent(url.hash.slice(1));
      url.hash = "";
      await readFile(url);
      if (match.startsWith("!")) {
        assert.ok(
          url.pathname.includes("/docs/handbook/images/en/"),
          `${entry.path}: English chapter references a Chinese screenshot`,
        );
        const original = new URL(url.href.replace("/images/en/", "/images/"));
        assert.notDeepEqual(
          await readFile(url),
          await readFile(original),
          `${href}: English screenshot is an unchanged copy of the Chinese image`,
        );
        continue;
      }
      const target = byUrl.get(url.href);
      assert.ok(target, `${entry.path} links outside English catalog: ${href}`);
      if (anchor)
        assert.ok(
          headings(await read(target.path)).some(({ id }) => id === anchor),
          href,
        );
    }
  }
});

test("stable documentation switches reading, search and assistant calls without replacing the host", async () => {
  let language = "zh-CN";
  const loads = { "zh-CN": 0, en: 0 };
  const indexes = { "zh-CN": 0, en: 0 };
  const variants = Object.fromEntries(
    [
      ["zh-CN", zh],
      ["en", en],
    ].map(([locale, catalog]) => {
      const entries = catalog.chapters.map((entry) => ({
        ...entry,
        sectionAliases:
          locale === "en"
            ? entry.sectionAliases
            : Object.fromEntries(
                Object.entries(en.chapters.find(({ id }) => id === entry.id).sectionAliases).map(
                  ([zh, en]) => [en, zh],
                ),
              ),
      }));
      return [
        locale,
        createDocumentation(
          catalog.version,
          entries,
          async (path) => {
            loads[locale]++;
            return read(path);
          },
          async () => {
            indexes[locale]++;
            return Promise.all(
              entries.map(async ({ path }) => ({ path, content: await read(path) })),
            );
          },
        ),
      ];
    }),
  );
  const docs = localizeDocumentation(variants, () => language);
  const tools = createAssistantTools({
    docs,
    registry: {},
    functions: () => ({}),
    changed: () => {},
    signal: new AbortController().signal,
  });
  assert.equal((await docs.read("variables")).entry.title, "字段：变量");
  const pendingChinese = docs.read("variables");
  language = "en";
  assert.equal((await pendingChinese).entry.title, "字段：变量");
  assert.equal(docs.entries[0].title, "What is Soyori?");
  assert.match(
    (await docs.read("docs/handbook/flows/variables.md")).content,
    /## Reference a variable/,
  );
  assert.ok((await docs.search("notebook")).some(({ id }) => id === "quick-start-memory"));
  const result = await tools["project.docs"]({ path: "variables", section: "引用" });
  assert.match(result.content, /^## Reference a variable/);
  assert.ok(
    (await tools["project.docs"]({ query: "notebook" })).some(
      ({ id }) => id === "quick-start-memory",
    ),
  );
  language = "zh-CN";
  assert.match((await docs.read("docs/handbook/en/flows/variables.md")).content, /## 引用/);
  assert.match(
    (await tools["project.docs"]({ path: "variables", section: "reference-a-variable" })).content,
    /^## 引用/,
  );
  assert.ok((await docs.search("声明")).some(({ id }) => id === "variables"));
  assert.deepEqual(loads, { "zh-CN": 1, en: 1 });
  assert.deepEqual(indexes, { "zh-CN": 1, en: 1 });
  language = "unsupported";
  assert.equal(docs.entries[0].title, zh.chapters[0].title);
  await assert.rejects(docs.read("docs/project-context.md"), /DOC_NOT_FOUND/);
});
