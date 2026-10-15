import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Verify the origin/account before enabling this deliberately fixed target.
const bucket = "soyori-web-prod-961808228151-ap-southeast-1-an";
const distribution = "EX63P0WN21EXX";
const dist = "packages/editor/dist";
const dryRun = process.argv.includes("--dry-run");
const files = [];
function walk(directory, prefix = "") {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const key = `${prefix}${name}`;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink cannot be deployed: ${key}`);
    if (stat.isDirectory()) walk(path, `${key}/`);
    else if (stat.isFile()) files.push(key);
  }
}
walk(dist);
if (!files.includes("index.html")) throw new Error("Missing dist/index.html");
const assets = files.filter((file) => file.startsWith("assets/"));
if (!assets.length) throw new Error("Missing Vite assets");
for (const file of assets) {
  if (!/-[\w-]{8,}\.[\w]+$/.test(file)) {
    throw new Error(`Cannot give immutable caching to an unhashed asset: ${file}`);
  }
}
const html = readFileSync(join(dist, "index.html"), "utf8");
for (const [, asset] of html.matchAll(/(?:src|href)="\/?(assets\/[^"?#]+)"/g)) {
  if (!files.includes(asset)) throw new Error(`Entry references missing asset: ${asset}`);
}
function aws(...args) {
  console.log(JSON.stringify(["aws", ...args]));
  if (dryRun) return "dry-run";
  const result = spawnSync("aws", args, { encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || `AWS exited ${result.status}`);
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout.trim();
}
const destination = `s3://${bucket}/`;
const common = ["--region", "ap-southeast-1", "--only-show-errors", "--no-follow-symlinks"];
// Never delete old assets, change ACLs, or mutate bucket/distribution configuration.
aws(
  "s3",
  "cp",
  `${dist}/assets/`,
  `${destination}assets/`,
  "--recursive",
  "--cache-control",
  "public,max-age=31536000,immutable",
  ...common,
);
aws(
  "s3",
  "cp",
  `${dist}/`,
  destination,
  "--recursive",
  "--exclude",
  "assets/*",
  "--exclude",
  "index.html",
  "--cache-control",
  "public,max-age=0,must-revalidate",
  ...common,
);
aws(
  "s3",
  "cp",
  `${dist}/index.html`,
  `${destination}index.html`,
  "--cache-control",
  "no-cache,no-store,must-revalidate",
  "--content-type",
  "text/html; charset=utf-8",
  ...common,
);
// Include SPA aliases and mutable public files.
const invalidation = aws(
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  distribution,
  "--paths",
  "/*",
  "--query",
  "Invalidation.Id",
  "--output",
  "text",
);
aws(
  "cloudfront",
  "wait",
  "invalidation-completed",
  "--distribution-id",
  distribution,
  "--id",
  invalidation,
);
