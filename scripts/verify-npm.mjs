import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { npmCli, root, runNode } from "./npm-runtime.mjs";

const { destination } = JSON.parse(await readFile(join(root, "output/npm/latest.json"), "utf8"));
const artifacts = JSON.parse(await readFile(join(destination, "artifacts.json"), "utf8"));
await writeFile(join(destination, "verification.json"), '{"verified":false,"status":"running"}\n');
const directory = await mkdtemp(join(tmpdir(), "soyori-npm-"));
let base;
const requested = new Set();
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, base).pathname).slice(1);
    const artifact = artifacts.find((item) => item.name === path);
    if (artifact) {
      requested.add(artifact.name);
      const { filename, integrity, ...manifest } = artifact;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name: manifest.name,
          "dist-tags": { latest: manifest.version },
          versions: {
            [manifest.version]: {
              ...manifest,
              dist: { tarball: `${base}/tar/${filename}`, integrity },
            },
          },
        }),
      );
    } else if (path === "v1/chat/completions") {
      let body = "";
      for await (const chunk of request) body += chunk;
      assert.equal(JSON.parse(body).messages.at(-1).content, "hello");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "test",
          object: "chat.completion",
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "remote reply" },
              finish_reason: "stop",
            },
          ],
        }),
      );
    } else if (path.startsWith("tar/")) {
      const packed = artifacts.find((item) => `tar/${item.filename}` === path);
      assert.ok(packed, "Unknown tarball");
      const bytes = await readFile(join(destination, packed.filename));
      assert.equal(
        `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
        packed.integrity,
      );
      response.end(bytes);
    } else if (path.startsWith("-/")) {
      response.statusCode = 404;
      response.end();
    } else {
      response.writeHead(307, { location: `https://registry.npmjs.org/${path}` });
      response.end();
    }
  } catch {
    response.statusCode = 500;
    response.end("Local package fixture failed.");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}`;
try {
  await writeFile(
    join(directory, "package.json"),
    '{"name":"soyori-install-check","private":true,"type":"module"}\n',
  );
  const cli = artifacts.find((item) => item.bin?.soyori);
  assert.ok(cli, "CLI package with soyori command is missing.");
  console.log(`Installing ${cli.name}@${cli.version} outside the workspace: ${directory}`);
  await runNode(
    [
      npmCli(),
      "install",
      `${cli.name}@${cli.version}`,
      "--registry",
      base,
      "--no-audit",
      "--no-fund",
    ],
    { cwd: directory },
  );
  for (const artifact of artifacts)
    assert.ok(requested.has(artifact.name), `Dependency not installed: ${artifact.name}`);
  const entry = join(directory, "node_modules", cli.name, "dist/index.js");
  const help = await runNode([entry, "--help"], { cwd: directory });
  assert.match(help.stdout, /soyori/);
  await writeFile(
    join(directory, "hello.yaml"),
    "schemaVersion: 1\nname: install-check\nfields:\n  answer:\n    output: true\nsteps:\n  - type: template\n    template: 安装成功\n    output: $answer\n",
  );
  const hello = await runNode([entry, "run", "hello.yaml", "--json"], { cwd: directory });
  assert.deepEqual(JSON.parse(hello.stdout).result, { answer: "安装成功" });
  await writeFile(
    join(directory, "script.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "script-check",
      fields: { answer: { output: true } },
      steps: [
        {
          type: "call",
          target: "script.run",
          inputs: { code: "result(input.value + 1)", input: { value: 4 } },
          output: "$answer",
        },
      ],
    }),
  );
  const script = await runNode([entry, "run", "script.json", "--json"], { cwd: directory });
  assert.equal(JSON.parse(script.stdout).result.answer, 5);
  await writeFile(
    join(directory, "ai.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "ai-check",
      fields: { answer: { output: true } },
      steps: [
        {
          type: "call",
          target: "llm.auto",
          inputs: { input: "hello" },
          outputs: { result: "$answer" },
        },
      ],
    }),
  );
  const ai = await runNode(
    [
      entry,
      "run",
      "ai.json",
      "--json",
      "--env",
      "LLM_PROVIDER=openai",
      "--env",
      "OPENAI_MODEL=test-model",
      "--env",
      "OPENAI_API_KEY=test-key",
      "--env",
      `OPENAI_BASE_URL=${base}/v1`,
    ],
    { cwd: directory },
  );
  assert.equal(JSON.parse(ai.stdout).result.answer, "remote reply");
  await runNode(
    [
      npmCli(),
      "install",
      ...artifacts.filter((item) => item !== cli).map((item) => `${item.name}@${item.version}`),
      "--registry",
      base,
      "--no-audit",
      "--no-fund",
    ],
    { cwd: directory },
  );
  for (const suffix of [
    "ai/local",
    "ai/tokens",
    "storage/environment",
    "storage/node",
    "script",
    "tools",
    "core",
  ]) {
    const [name, ...subpath] = suffix.split("/");
    const artifact = artifacts.find((item) => item.repository.directory === `packages/${name}`);
    assert.ok(artifact, `Missing public package: ${name}`);
    const specifier = [artifact.name, ...subpath].join("/");
    await runNode(["--input-type=module", "-e", `await import('${specifier}')`], {
      cwd: directory,
    });
  }
  const bin = process.platform === "win32" ? "soyori.cmd" : "soyori";
  await readFile(join(directory, "node_modules/.bin", bin));
  await writeFile(
    join(destination, "verification.json"),
    `${JSON.stringify({ verified: true, platform: process.platform, node: process.version, directory, checks: ["registry dependency resolution", "tarball integrity", "command shim", "help", "YAML runtime worker", "script worker", "remote AI SDK (mock)", "public exports"] }, null, 2)}\n`,
  );
  console.log(
    "PASS: clean npm installation, CLI command, YAML execution, script worker and public exports.",
  );
} catch (error) {
  await writeFile(join(destination, "verification.json"), '{"verified":false,"status":"failed"}\n');
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
