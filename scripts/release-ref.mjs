import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function resolveRelease({ ref, expectedSha, git }) {
  const match = /^refs\/tags\/(v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(ref ?? "");
  if (!match || match[0] !== ref)
    throw new Error("Release ref must be a stable tag such as v0.1.1");
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? "")) throw new Error("Invalid fixed commit SHA");
  const tag = match[1];
  git([
    "fetch",
    "--no-tags",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    `+refs/tags/${tag}:refs/tags/${tag}`,
  ]);
  const sha = git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]).trim();
  if (sha !== expectedSha) throw new Error("Tag moved or does not match the triggering commit");
  git(["merge-base", "--is-ancestor", sha, "refs/remotes/origin/main"]);
  return { tag, sha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const release = resolveRelease({
    ref: process.env.RELEASE_REF,
    expectedSha: process.env.RELEASE_SHA,
    git: (args) =>
      execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  });
  console.log(JSON.stringify(release));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `sha=${release.sha}\ntag=${release.tag}\n`);
  }
}
