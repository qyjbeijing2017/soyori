import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveRelease } from "./release-ref.mjs";

const sha = "a".repeat(40);
test("rejects branches, prereleases, metadata, leading zeros and injection before git", () => {
  for (const ref of [
    "refs/heads/main",
    "refs/tags/foo",
    "refs/tags/v01.2.3",
    "refs/tags/v1.02.3",
    "refs/tags/v1.2.03",
    "refs/tags/v1.2.3-rc.1",
    "refs/tags/v1.2.3+build",
    "refs/tags/v1.2",
    "refs/tags/v1.2.3\n",
    "refs/tags/v1.2.3;echo bad",
  ]) {
    assert.throws(
      () =>
        resolveRelease({
          ref,
          expectedSha: sha,
          git() {
            assert.fail("invalid ref reached git");
          },
        }),
      /stable tag/,
    );
  }
});
test("accepts stable versions and binds validation to the exact commit", () => {
  for (const tag of ["v0.0.0", "v0.1.1", "v12.34.567"]) {
    const calls = [];
    assert.deepEqual(
      resolveRelease({
        ref: `refs/tags/${tag}`,
        expectedSha: sha,
        git(args) {
          calls.push(args);
          return args[0] === "rev-parse" ? sha : "";
        },
      }),
      { tag, sha },
    );
    assert.deepEqual(calls.at(-1), [
      "merge-base",
      "--is-ancestor",
      sha,
      "refs/remotes/origin/main",
    ]);
  }
});
test("rejects absent, moved or off-main tags", () => {
  for (const failure of ["fetch", "rev-parse", "merge-base"]) {
    assert.throws(
      () =>
        resolveRelease({
          ref: "refs/tags/v1.2.3",
          expectedSha: sha,
          git(args) {
            if (args[0] === failure) throw new Error(failure);
            return args[0] === "rev-parse" ? sha : "";
          },
        }),
      new RegExp(failure),
    );
  }
  assert.throws(
    () =>
      resolveRelease({
        ref: "refs/tags/v1.2.3",
        expectedSha: sha,
        git(args) {
          return args[0] === "rev-parse" ? "b".repeat(40) : "";
        },
      }),
    /Tag moved/,
  );
});
test("real git validates lightweight and annotated tags but rejects detached history and missing tags", () => {
  const dir = mkdtempSync(join(tmpdir(), "soyori-release-ref-"));
  const remote = join(dir, "remote");
  const local = join(dir, "local");
  const run = (cwd, args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(dir, "no-global-config"),
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.invalid",
      },
    });
  try {
    run(dir, ["init", "--bare", remote]);
    run(dir, ["init", "-b", "main", local]);
    run(local, ["remote", "add", "origin", remote]);
    run(local, ["commit", "--allow-empty", "-m", "main"]);
    const main = run(local, ["rev-parse", "HEAD"]).trim();
    run(local, ["tag", "v1.0.0"]);
    run(local, ["tag", "-a", "v1.0.1", "-m", "annotated"]);
    run(local, ["checkout", "--orphan", "unrelated"]);
    run(local, ["commit", "--allow-empty", "-m", "unrelated"]);
    const unrelated = run(local, ["rev-parse", "HEAD"]).trim();
    run(local, ["tag", "v2.0.0"]);
    run(local, ["push", "origin", "main", "--tags"]);
    const git = (args) => run(local, args);
    for (const tag of ["v1.0.0", "v1.0.1"]) {
      assert.equal(resolveRelease({ ref: `refs/tags/${tag}`, expectedSha: main, git }).sha, main);
    }
    assert.throws(() => resolveRelease({ ref: "refs/tags/v2.0.0", expectedSha: unrelated, git }));
    assert.throws(() => resolveRelease({ ref: "refs/tags/v9.0.0", expectedSha: main, git }));
    assert.throws(
      () => resolveRelease({ ref: "refs/tags/v1.0.0", expectedSha: unrelated, git }),
      /Tag moved/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
