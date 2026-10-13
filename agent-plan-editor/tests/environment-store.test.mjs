import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { effectiveEnvironment } from "agent-plan-storage/environment";
import {
  environmentStorage,
  flushEnvironmentWrites,
  persistEnvironment,
} from "../src/environment-store.ts";

test("automatic writes retain order and snapshot values, including after changing file scope", async () => {
  const initial = { TOKEN: { value: "first", sensitive: true } };
  const first = persistEnvironment(initial, undefined, "file-a");
  initial.TOKEN.value = "mutated";
  const second = persistEnvironment(
    { TOKEN: { value: "second", sensitive: true } },
    undefined,
    "file-a",
  );
  const other = persistEnvironment(
    { TOKEN: { value: "other", sensitive: true } },
    undefined,
    "file-b",
  );
  await flushEnvironmentWrites();
  await Promise.all([first, second, other]);
  assert.equal(
    (await effectiveEnvironment(environmentStorage, undefined, "file-a")).TOKEN.value,
    "second",
  );
  assert.equal(
    (await effectiveEnvironment(environmentStorage, undefined, "file-b")).TOKEN.value,
    "other",
  );
  await persistEnvironment({}, undefined, "file-a");
  assert.equal(
    Object.hasOwn(await effectiveEnvironment(environmentStorage, undefined, "file-a"), "TOKEN"),
    false,
  );
});

test("failed automatic save rejects the run barrier; a later retry recovers", async () => {
  const original = environmentStorage.write;
  environmentStorage.write = async () => {
    throw Error("quota");
  };
  try {
    await assert.rejects(
      persistEnvironment({ TOKEN: { value: "failed", sensitive: true } }),
      /quota/,
    );
    await assert.rejects(flushEnvironmentWrites(), /quota/);
  } finally {
    environmentStorage.write = original;
  }
  await persistEnvironment({ TOKEN: { value: "recovered", sensitive: true } });
  await flushEnvironmentWrites();
  assert.equal((await effectiveEnvironment(environmentStorage)).TOKEN.value, "recovered");
});
