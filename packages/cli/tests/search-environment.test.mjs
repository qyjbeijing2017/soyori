import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("CLI search reads --env and a subsequent runtime override using the shared adapter", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "soyori-search-env-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const functions = join(dir, "mock.mjs");
  await writeFile(
    functions,
    `
    import assert from 'node:assert/strict';
    globalThis.fetch = async (address, options) => {
      assert.equal(new URL(address).host, 'api.bocha.cn');
      const body = JSON.parse(options.body);
      assert.equal(options.headers.get('authorization'), body.query === 'first' ? 'Bearer initial-search-key' : 'Bearer updated-search-key');
      return Response.json({code:200,data:{webPages:{value:[{name:body.query,url:'https://example.com',snippet:'found'}]}}});
    };
    export default {};
  `,
  );
  const file = join(dir, "search.json");
  await writeFile(
    file,
    JSON.stringify({
      schemaVersion: 1,
      name: "search-env",
      fields: { first: { output: true }, second: { output: true } },
      steps: [
        {
          type: "call",
          target: "web.search",
          inputs: { query: "first" },
          outputs: { results: "$first" },
        },
        {
          type: "call",
          target: "env.override",
          inputs: { name: "BOCHA_API_KEY", value: "updated-search-key" },
        },
        {
          type: "call",
          target: "web.search",
          inputs: { query: "second" },
          outputs: { results: "$second" },
        },
      ],
    }),
  );
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL("../dist/index.js", import.meta.url)),
      "run",
      file,
      "--functions",
      functions,
      "--storage-dir",
      join(dir, "data"),
      "--env",
      "SEARCH_PROVIDER=bocha",
      "--env",
      "BOCHA_API_KEY=initial-search-key",
      "--json",
    ],
    { timeout: 15000 },
  );
  const reply = JSON.parse(stdout);
  assert.equal(reply.ok, true);
  assert.equal(reply.result.first[0].title, "first");
  assert.equal(reply.result.second[0].title, "second");
  assert.doesNotMatch(stdout + stderr, /initial-search-key|updated-search-key/);
});
