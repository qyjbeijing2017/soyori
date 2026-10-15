import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { posix } from "node:path";

const root = new URL("../", import.meta.url);
const check = process.argv.includes("--check");
assert.ok(
  process.argv.slice(2).every((arg) => arg === "--check"),
  "Use --check or no arguments.",
);
const cell = (text) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const link = (text, path) => `[${cell(text)}](${path})`;

for (const english of [true, false]) {
  const prefix = english ? "en/" : "";
  const catalog = JSON.parse(
    await readFile(new URL(`docs/handbook/${prefix}index.json`, root), "utf8"),
  );
  const filename = `docs/handbook/README${english ? "" : ".zh-CN"}.md`;
  const examples = new Map(catalog.examples.map((example) => [example.id, example]));
  const chapterPath = (path) => posix.relative("docs/handbook", path);
  const examplePath = (example, file) => `${prefix}examples/${example.id}/${file}`;
  const lines = [
    `# ${english ? "Soyori Document — User handbook" : "Soyori Document 使用手册"}`,
    "",
    english
      ? "**English** | [简体中文](README.zh-CN.md) | [Project README](../../README.md)"
      : "[English](README.md) | **简体中文** | [项目 README](../../README.zh-CN.md)",
    "",
    english
      ? "Read the same handbook used by the Editor's Document page and built-in assistant, directly on GitHub. All chapter, screenshot, and example links are relative to this repository."
      : "这里是 Editor 的 Document 页面与内置助手共用的手册，可直接在 GitHub 阅读。章节、截图和示例均使用仓库相对路径。",
    "",
    english
      ? "Start with a desktop, mobile, or CLI quick start, then continue with memory and tools. Use the Examples links to read complete files. On a GitHub file page, use Raw or Download raw file to save a copy; keep the relative paths of multi-file examples. In the Editor, the chapter's Import example button copies these files into Library."
      : "先选择电脑、手机或 CLI 入门，再学习记忆和工具。示例列可以直接打开完整文件；在 GitHub 文件页使用 Raw 或 Download raw file 保存，多文件示例需保留相对路径。Editor 内的章节还提供“导入示例”按钮，将同一组文件复制到文件库。",
    "",
    english
      ? "[Official website / Online Editor](https://soyori.joycows.com) · [Online handbook](https://soyori.joycows.com/#document/introduction). Choose English or Chinese in Settings. Report bugs through [GitHub Issues](https://github.com/qyjbeijing2017/soyori/issues); for other contact details, see the [introduction](en/introduction.md)."
      : "[官网 / 在线编辑器](https://soyori.joycows.com) · [在线手册](https://soyori.joycows.com/#document/introduction)，可在设置中切换中文或 English。Bug 请通过 [GitHub Issues](https://github.com/qyjbeijing2017/soyori/issues) 提交，其他联系方式见[产品简介](introduction.md)。",
    "",
    "<!-- Generated from index.json and en/index.json by scripts/handbook-index.mjs. -->",
  ];
  for (const group of new Set(catalog.chapters.map((chapter) => chapter.group))) {
    lines.push(
      "",
      `## ${group}`,
      "",
      english ? "| Chapter | Covers | Examples |" : "| 章节 | 内容 | 示例 |",
      "| --- | --- | --- |",
    );
    for (const chapter of catalog.chapters.filter((chapter) => chapter.group === group)) {
      const files = (chapter.examples ?? []).map((id) => {
        const example = examples.get(id);
        assert.ok(example, `Unknown example ${id} in ${chapter.id}`);
        return link(example.title, examplePath(example, example.entry));
      });
      lines.push(
        `| ${link(chapter.title, chapterPath(chapter.path))} | ${cell(chapter.summary)} | ${files.join(" · ") || "—"} |`,
      );
    }
  }
  lines.push(
    "",
    `## ${english ? "Complete example files" : "完整示例文件"}`,
    "",
    english ? "| Example | Entry flow | All files |" : "| 示例 | 入口流程 | 全部文件 |",
    "| --- | --- | --- |",
  );
  for (const example of catalog.examples) {
    lines.push(
      `| ${cell(example.title)} | ${link(example.entry, examplePath(example, example.entry))} | ${example.files.map((file) => link(file, examplePath(example, file))).join(" · ")} |`,
    );
  }
  const content = `${lines.join("\n")}\n`;
  if (check) assert.equal(await readFile(new URL(filename, root), "utf8"), content, filename);
  else await writeFile(new URL(filename, root), content);
  console.log(`${check ? "Verified" : "Generated"} ${filename}`);
}
