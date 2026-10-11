import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRuntime, parseFlow } from "agent-plan-core";
import { parse } from "yaml";
import { createAssistantTools } from "../src/assistant-tools.ts";
import { createDocumentation, headings } from "../src/documentation.ts";

const catalog = JSON.parse(
  await readFile(new URL("../../docs/handbook/index.json", import.meta.url), "utf8"),
);
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("handbook loads only the requested chapter; full-text index is separate and cached", async () => {
  let loads = 0,
    searches = 0;
  const docs = createDocumentation(
    catalog.version,
    catalog.chapters,
    async (path) => {
      loads++;
      return read(path);
    },
    async () => {
      searches++;
      return Promise.all(
        catalog.chapters.map(async (entry) => ({
          path: entry.path,
          content: await read(entry.path),
        })),
      );
    },
  );
  await docs.search("");
  assert.equal(loads, 0);
  assert.equal(searches, 0);
  const article = await docs.read("scripts");
  assert.match(article.content, /result\(value\)/);
  await docs.read(article.entry.path);
  assert.equal(loads, 1);
  assert.ok((await docs.search("Worker")).some((entry) => entry.id === "scripts"));
  await docs.search("不存在的词语");
  assert.equal(searches, 1);
  assert.equal(loads, 1);
  await assert.rejects(docs.read("docs/project-context.md"), /DOC_NOT_FOUND/);
});

test("assistant handbook reads sections and reports exact continuation offsets", async () => {
  const content = "# Guide\n\n## Script\nline one\n### Details\nline two\n## Storage\nother\n";
  const docs = createDocumentation(
    "test",
    [{ id: "guide", path: "docs/guide.md", title: "Guide", group: "test", summary: "Guide" }],
    async () => content,
    async () => [],
  );
  const tools = createAssistantTools({
    docs,
    registry: {},
    functions: () => ({}),
    changed: () => {},
    signal: new AbortController().signal,
  });
  const first = await tools["project.docs"]({ path: "guide", section: "script", limit: 10 });
  assert.equal(first.nextOffset, 10);
  const rest = await tools["project.docs"]({
    path: "guide",
    section: "script",
    offset: first.nextOffset,
  });
  assert.equal(first.content + rest.content, "## Script\nline one\n### Details\nline two\n");
  assert.equal(rest.nextOffset, null);
  await assert.rejects(
    tools["project.docs"]({ path: "guide", section: "missing" }),
    /DOC_SECTION_NOT_FOUND/,
  );
  assert.deepEqual(
    headings("# Guide\n```js\n## fake\n```\n## Real\n## Real\n").map((h) => h.id),
    ["guide", "real", "real-2"],
  );
});

test("handbook chapters and links exist, identities are unique and examples parse through Core", async () => {
  assert.equal(new Set(catalog.chapters.map((entry) => entry.id)).size, catalog.chapters.length);
  assert.equal(new Set(catalog.chapters.map((entry) => entry.path)).size, catalog.chapters.length);
  for (const entry of catalog.chapters) {
    const content = await read(entry.path);
    assert.ok(content.startsWith("# "));
    for (const match of content.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      const url = new URL(match[1], new URL(`../../${entry.path}`, import.meta.url));
      await readFile(url);
      assert.ok(
        catalog.chapters.some(
          (chapter) => new URL(`../../${chapter.path}`, import.meta.url).href === url.href,
        ),
      );
    }
    for (const id of entry.examples ?? [])
      assert.ok(catalog.examples.some((example) => example.id === id));
  }
  for (const example of catalog.examples) {
    for (const file of example.files) {
      const content = await read(`docs/handbook/examples/${example.id}/${file}`);
      if (file.endsWith(".yaml")) parseFlow(parse(content));
    }
  }
});

test("deterministic handbook examples produce documented results and intentional failure", async () => {
  const load = async (path) => {
    const definition = parseFlow(parse(await read(path)));
    const imports = new Map();
    for (const [alias, source] of Object.entries(definition.imports ?? {})) {
      const child = new URL(source, `https://local/${path}`).pathname.slice(1);
      imports.set(alias, await load(child));
    }
    return { definition, imports, source: path };
  };
  for (const [path, inputs, expected] of [
    ["hello/hello.yaml", { name: "小明" }, { chatOut: "你好，小明！" }],
    ["counter/counter.yaml", {}, { count: 3 }],
    ["subflows/main.yaml", {}, { answer: 3 }],
    ["debugging/fixed.yaml", {}, { answer: 5 }],
  ]) {
    const state = await createRuntime(await load(`docs/handbook/examples/${path}`), inputs).run();
    assert.equal(state.status, "completed");
    assert.deepEqual(state.output, expected);
  }
  const state = await createRuntime(
    await load("docs/handbook/examples/debugging/broken.yaml"),
  ).run();
  assert.equal(state.status, "failed");
  assert.equal(state.error.code, "DIVISION_BY_ZERO");
});
