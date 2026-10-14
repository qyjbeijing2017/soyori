import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { npmCli, packages, root, runNode } from "./npm-runtime.mjs";

const config = JSON.parse(await readFile(join(root, "package.json"), "utf8")).soyoriRelease;
assert.match(config.version, /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/);
const destination = join(root, "output/npm", `${config.version}-${Date.now()}`);
// Exclusive directory creation prevents publishing stale files from an earlier pack.
await mkdir(join(root, "output/npm"), { recursive: true });
await mkdir(destination);
const artifacts = [];
for (const suffix of packages) {
  const source = join(root, "packages", suffix);
  const staging = join(destination, suffix);
  const original = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  assert.equal(original.name, `soyori-${suffix}`);
  const dependencies = Object.fromEntries(
    Object.entries(original.dependencies ?? {}).map(([name, value]) => {
      if (!value.startsWith("workspace:")) return [name, value];
      const target = name.replace(/^soyori-/, "");
      assert.ok(packages.includes(target), `Unknown workspace dependency: ${name}`);
      return [name, config.version];
    }),
  );
  const manifest = {
    name: original.name,
    version: config.version,
    type: "module",
    description: original.description ?? `Soyori ${suffix} tools and runtime.`,
    license: "MIT",
    engines: { node: ">=24" },
    files: ["dist", "README.md", "LICENSE"],
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
    repository: {
      type: "git",
      url: "git+https://github.com/qyjbeijing2017/soyori.git",
      directory: `packages/${suffix}`,
    },
    ...(original.bin ? { bin: original.bin } : {}),
    ...(original.exports ? { exports: original.exports } : {}),
    ...(original.main ? { main: original.main } : {}),
    ...(original.types ? { types: original.types } : {}),
    dependencies,
  };
  await mkdir(staging);
  await cp(join(source, "dist"), join(staging, "dist"), { recursive: true });
  await cp(join(root, "LICENSE"), join(staging, "LICENSE"));
  await writeFile(join(staging, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const usage =
    suffix === "cli"
      ? `\nRequires Node 24 or newer.\n\n\`\`\`sh\nnpm install -g ${manifest.name}\nsoyori --help\nsoyori run ./translate.yaml --json --timeout 10m\n\`\`\`\n\nLocal models are downloaded on demand, not included in this package.\n`
      : `\nInstall with \`npm install ${manifest.name}\`.\n`;
  await writeFile(
    join(staging, "README.md"),
    `# ${manifest.name}\n${usage}\n[Documentation and source](https://github.com/qyjbeijing2017/soyori/tree/main/packages/${suffix})\n\nMIT licensed.\n`,
  );
  const { stdout } = await runNode([
    npmCli(),
    "pack",
    staging,
    "--pack-destination",
    destination,
    "--json",
    "--ignore-scripts",
  ]);
  const [packed] = JSON.parse(stdout);
  assert.equal(packed.name, manifest.name);
  assert.ok(packed.files.some((file) => file.path === "LICENSE"));
  assert.ok(
    packed.files.every(
      (file) =>
        ["package.json", "README.md", "LICENSE"].includes(file.path) ||
        file.path.startsWith("dist/"),
    ),
  );
  for (const value of Object.values(dependencies)) assert.ok(!value.startsWith("workspace:"));
  if (suffix === "cli")
    for (const name of ["index.js", "worker.js", "script-worker.js"])
      assert.ok(packed.files.some((file) => file.path === `dist/${name}`));
  artifacts.push({ ...manifest, filename: packed.filename, integrity: packed.integrity });
  console.log(`Packed ${manifest.name}@${config.version}`);
}
await writeFile(join(destination, "artifacts.json"), `${JSON.stringify(artifacts, null, 2)}\n`);
await writeFile(join(root, "output/npm/latest.json"), `${JSON.stringify({ destination })}\n`);
console.log(`Ready for installation verification: ${destination}`);
