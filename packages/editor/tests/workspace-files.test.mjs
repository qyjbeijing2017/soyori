import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { createRuntime } from "soyori-core";
import { loadLibrary, saveDocument } from "../src/library.ts";
import { loadLibraryGraph } from "../src/library-calls.ts";
import {
  changeFiles,
  exportWorkspace,
  filePath,
  importArchive,
  importWorkspace,
  listFiles,
  moveFile,
  newFile,
  pathFromURL,
  readFile,
  removeFile,
  workspaceURL,
  writeFiles,
} from "../src/workspace-files.ts";

test("workspace preserves binary bytes, folders, IDs and ZIP paths; conflicts are atomic", async () => {
  const binary = newFile("assets/image.bin", new Blob([new Uint8Array([0, 255, 14])]));
  await writeFiles([binary, newFile("empty", new Blob(), "directory")]);
  assert.deepEqual(
    new Uint8Array(await (await readFile(binary.path)).content.arrayBuffer()),
    new Uint8Array([0, 255, 14]),
  );
  await assert.rejects(writeFiles([newFile("other.txt"), newFile(binary.path)]));
  assert.equal(await readFile("other.txt"), undefined);
  await assert.rejects(writeFiles([newFile("assets")]));
  await moveFile("assets", "media");
  assert.equal((await readFile("media/image.bin")).id, binary.id);
  const archive = await exportWorkspace();
  await removeFile("media");
  await removeFile("empty");
  await importArchive(new File([archive], "workspace.zip"));
  assert.deepEqual(
    new Uint8Array(await (await readFile("media/image.bin")).content.arrayBuffer()),
    new Uint8Array([0, 255, 14]),
  );
  assert.equal((await readFile("empty")).kind, "directory");
  assert.throws(() => filePath("../escape.js"));
  assert.equal(pathFromURL(workspaceURL("目录/a #%.js")), "目录/a #%.js");
});

test("ordinary JSON remains a file; valid flow files resolve imports and save as portable paths", async () => {
  const child = {
    schemaVersion: 1,
    name: "child",
    fields: { result: { output: true, initial: 12 } },
    steps: [],
  };
  const parent = {
    schemaVersion: 1,
    name: "parent",
    imports: { child: "./child.json" },
    fields: { result: { output: true } },
    steps: [{ type: "call", target: "child", outputs: { result: "$result" } }],
  };
  await writeFiles([
    newFile("project/child.json", new Blob([JSON.stringify(child)])),
    newFile("project/main.json", new Blob([JSON.stringify(parent)])),
    newFile("config.json", new Blob(['{"key":1}'])),
  ]);
  const docs = await loadLibrary();
  assert.equal(
    docs.some((doc) => doc.path === "config.json"),
    false,
  );
  const root = docs.find((doc) => doc.path === "project/main.json");
  const runtime = createRuntime(loadLibraryGraph(root, docs));
  await runtime.run();
  assert.deepEqual(runtime.getState().output, { result: 12 });
  const saved = await saveDocument({
    ...root,
    flow: { ...parent, imports: { child: "/project/child.json" } },
  });
  assert.equal(saved.flow.imports.child, "./child.json");
  assert.equal(
    JSON.parse(await (await readFile(root.path)).content.text()).imports.child,
    "./child.json",
  );
  assert.equal(
    (await listFiles()).some((file) => file.path === "config.json"),
    true,
  );
});

test("folder ZIP exports only its subtree; combined file and ZIP import uses current directory atomically", async () => {
  await writeFiles([
    newFile("export-test/nested/a.txt", new Blob(["content"])),
    newFile("export-test/nested/empty", new Blob(), "directory"),
    newFile("export-test/outside.txt"),
  ]);
  const archive = new File([await exportWorkspace("export-test/nested")], "nested.soyori.zip");
  await importWorkspace([archive, new File(["plain"], "note.txt")], "destination", true);
  assert.equal(await (await readFile("destination/nested/a.txt")).content.text(), "content");
  assert.equal((await readFile("destination/nested/empty")).kind, "directory");
  assert.equal(await readFile("destination/outside.txt"), undefined);
  assert.equal(await (await readFile("destination/note.txt")).content.text(), "plain");
  await assert.rejects(
    importWorkspace([new File(["new"], "new.txt"), archive], "destination", true),
  );
  assert.equal(await readFile("destination/new.txt"), undefined);
});

test("Soyori and legacy agentp packages unpack; ordinary ZIP bytes stay intact", async () => {
  const zip = await exportWorkspace("export-test/nested");
  await importWorkspace(
    [new File([zip], "backup.zip"), new File(["not a zip"], "invalid.zip")],
    "zip-files",
    true,
  );
  assert.deepEqual(
    new Uint8Array(await (await readFile("zip-files/backup.zip")).content.arrayBuffer()),
    new Uint8Array(await zip.arrayBuffer()),
  );
  assert.equal(await (await readFile("zip-files/invalid.zip")).content.text(), "not a zip");
  assert.equal(await readFile("zip-files/nested/a.txt"), undefined);
  await importWorkspace([new File([zip], "project.AGENTP.ZIP")], "package-files", true);
  assert.equal(await (await readFile("package-files/nested/a.txt")).content.text(), "content");
  await importWorkspace([new File([zip], "project.SOYORI.ZIP")], "soyori-package-files", true);
  assert.equal(
    await (await readFile("soyori-package-files/nested/a.txt")).content.text(),
    "content",
  );
});

test("native selection copy, move and delete persist atomically with stable move IDs", async () => {
  await writeFiles([
    newFile("operations/a/one.txt", new Blob(["one"])),
    newFile("operations/b/two.txt"),
  ]);
  const original = await readFile("operations/a/one.txt");
  await changeFiles("copy", ["operations/a"], "copies");
  assert.notEqual((await readFile("copies/a/one.txt")).id, original.id);
  await changeFiles("move", ["operations/a", "operations/b"], "moved");
  assert.equal((await readFile("moved/a/one.txt")).id, original.id);
  assert.equal(await readFile("operations/a/one.txt"), undefined);
  await assert.rejects(
    changeFiles("move", ["moved/a", "moved/b"], "copies"),
    /Destination already exists/,
  );
  assert.equal(await readFile("copies/b/two.txt"), undefined);
  await assert.rejects(changeFiles("move", ["moved"], "moved/a"));
  await changeFiles("delete", ["moved/a", "moved/b"]);
  assert.equal(await readFile("moved/a/one.txt"), undefined);
  assert.equal(await readFile("moved/b/two.txt"), undefined);
});

test("copy/paste in the same folder creates unique sibling copies without overwriting", async () => {
  await writeFiles([
    newFile("paste-test/love", new Blob(), "directory"),
    newFile("paste-test/love/main.js", new Blob(["original"])),
    newFile("paste-test/main.js", new Blob(["code"])),
  ]);
  await changeFiles("copy", ["paste-test/love"], "paste-test");
  await changeFiles("copy", ["paste-test/love"], "paste-test");
  assert.equal(await (await readFile("paste-test/love (2)/main.js")).content.text(), "original");
  assert.equal(await (await readFile("paste-test/love (3)/main.js")).content.text(), "original");
  assert.notEqual(
    (await readFile("paste-test/love (2)/main.js")).id,
    (await readFile("paste-test/love/main.js")).id,
  );
  await changeFiles("copy", ["paste-test/main.js"], "paste-test");
  assert.equal(await (await readFile("paste-test/main (2).js")).content.text(), "code");
  await changeFiles("move", ["paste-test/main.js"], "paste-test");
  assert.equal(await (await readFile("paste-test/main.js")).content.text(), "code");
});

test("new flows use their names as filenames, preserve dots and never overwrite collisions", async () => {
  const doc = {
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    flow: { schemaVersion: 1, name: "助手.v1", fields: {}, steps: [] },
  };
  const saved = await saveDocument(doc, "named-flows");
  assert.equal(saved.path, "named-flows/助手.v1.yaml");
  assert.equal((await readFile(saved.path)).id, doc.id);
  const renamed = await saveDocument({ ...saved, flow: { ...saved.flow, name: "助手.v2" } });
  assert.equal(renamed.path, saved.path);
  await writeFiles([newFile("named-flows/occupied.yaml", new Blob(["keep me"]))]);
  await assert.rejects(
    saveDocument(
      { ...doc, id: crypto.randomUUID(), flow: { ...doc.flow, name: "occupied" } },
      "named-flows",
    ),
  );
  assert.equal(await (await readFile("named-flows/occupied.yaml")).content.text(), "keep me");
});
