import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createStorageTools, encode, validateKey } from "../dist/index.js";
import { createFileStorage } from "../dist/node.js";

test("JSON storage persists null, replaces documents and filters key prefixes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agent-storage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createFileStorage(root);
  assert.deepEqual(await store.read("a/memory"), { found: false, value: null });
  await store.write("a/memory", { messages: ["你好"] });
  assert.deepEqual(JSON.parse(await readFile(join(root, "a", "memory.json"), "utf8")), {
    messages: ["你好"],
  });
  await store.write("a/memory", null);
  await store.write("a-other/test", 1);
  assert.deepEqual(await createFileStorage(root).read("a/memory"), { found: true, value: null });
  assert.deepEqual(await store.list("a/"), { keys: ["a/memory"] });
  assert.deepEqual(await store.delete("a/memory"), { deleted: true });
  assert.deepEqual(await store.delete("a/memory"), { deleted: false });
  await writeFile(join(root, "broken.json"), "{");
  await assert.rejects(store.read("broken"), /STORAGE_CORRUPT/);
  await assert.rejects(
    createStorageTools(store)["storage.write"]({ key: "../outside", value: 1 }),
    /STORAGE_KEY/,
  );
});

test("keys are portable and JSON writes never silently discard invalid values", () => {
  for (const key of ["", "../a", "/a", "a//b", "a/../b", "a\\b", "C:/a", "con", "aux.txt", "a."])
    assert.throws(() => validateKey(key));
  const cycle = {};
  cycle.self = cycle;
  const sparse = Array(1);
  sparse.extra = 1;
  for (const value of [
    undefined,
    NaN,
    Infinity,
    1n,
    () => {},
    new Date(),
    cycle,
    [undefined],
    sparse,
  ])
    assert.throws(() => encode(value), /STORAGE_JSON/);
  let accessed = false;
  assert.throws(() =>
    encode({
      get secret() {
        accessed = true;
        return 1;
      },
    }),
  );
  assert.equal(accessed, false);
  assert.equal(encode({ a: null }), '{"a":null}');
});
