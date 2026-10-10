import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { createBrowserStorage } from "agent-plan-storage/browser";
import { loadLibrary } from "../src/library.ts";
import { loadLibraryGraph } from "../src/library-calls.ts";
import { listFiles } from "../src/workspace-files.ts";

test("legacy Library migration preserves IDs, backups and dependencies across concurrent loads", async () => {
  const storage = createBrowserStorage("agent-plan-library");
  const child = {
    id: "child",
    updatedAt: "2026-10-01",
    flow: { schemaVersion: 1, name: "child", fields: {}, steps: [] },
  };
  const parent = {
    id: "parent",
    updatedAt: "2026-10-01",
    flow: {
      schemaVersion: 1,
      name: "parent",
      imports: { child: "library:child" },
      fields: {},
      steps: [],
    },
  };
  await storage.write("flows/child", child);
  await storage.write("flows/parent", parent);
  const [docs, concurrent] = await Promise.all([loadLibrary(), loadLibrary()]);
  assert.equal(docs.length, 2);
  assert.equal(concurrent.length, 2);
  assert.equal((await listFiles()).length, 2);
  const migrated = docs.find((doc) => doc.id === "parent");
  assert.equal(migrated.flow.imports.child, "./child.yaml");
  assert.equal(loadLibraryGraph(migrated, docs).imports.get("child").definition.name, "child");
  assert.deepEqual((await storage.read("flows/parent")).value, parent);
});
