import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { createProgress } from "../dist/progress.js";

function capture(isTTY) {
  let text = "";
  const output = new Writable({
    write(chunk, _, done) {
      text += chunk.toString();
      done();
    },
  });
  output.isTTY = isTTY;
  output.columns = 120;
  return { progress: createProgress(output), text: () => text };
}

test("redirected progress keeps stages without percentages or terminal escapes", () => {
  const { progress, text } = capture(false);
  progress.update("正在加载");
  for (let i = 0; i <= 100; i++) progress.update(`加载 tokenizer.json：${i}%`);
  progress.update("已就绪");
  progress.finish();
  assert.equal(text(), "[AI] 正在加载\n[AI] 已就绪\n");
});

test("interactive progress stays on one line and ends before logs or results", () => {
  const { progress, text } = capture(true);
  progress.update("加载 tokenizer.json：1%");
  progress.update("加载 tokenizer.json：2%");
  assert.equal(text().includes("\n"), false);
  assert.ok(text().includes("\u001b[2K"));
  progress.log(Buffer.from("host log\n"));
  assert.ok(text().endsWith("\nhost log\n"));
  progress.update("加载 tokenizer.json：100%");
  progress.finish();
  const finished = text();
  progress.finish();
  assert.equal(text(), finished);
  assert.ok(finished.endsWith("\n"));
});
