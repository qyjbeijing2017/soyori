import assert from "node:assert/strict";
import test from "node:test";
import { bundleScript, executeScript, moduleSource, scriptInput } from "../dist/index.js";

test("static, dynamic, re-export, JSON and cycles use one module instance", async () => {
  const files = {
    "workspace:/a/main.js": `import { value } from './bridge.js';
      import data from './data.json';
      export default async () => { const a = await import('./counter.js'); const b = await import('./counter.js');
        return [value(), data.n, a === b, a.next(), b.next(), import.meta.url]; };`,
    "workspace:/a/bridge.js": `export { value } from './cycle.js';`,
    "workspace:/a/cycle.js": `import { value as again } from './bridge.js'; export function value() { return typeof again; }`,
    "workspace:/a/counter.js": `let n = 0; export const next = () => ++n;`,
    "workspace:/a/data.json": `{"n":7}`,
  };
  const code = await bundleScript(
    { code: "export { default } from './main.js';" },
    "workspace:/a/flow.yaml",
    {
      platform: "browser",
      resolve: (ref, base) => new URL(ref, base).href,
      load: async (source) => {
        assert.ok(source in files, source);
        return { source, text: files[source] };
      },
    },
  );
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  assert.deepEqual(await module.default(), ["function", 7, true, 1, 2, "workspace:/a/main.js"]);
});
test("inline source in a JSON flow resolves relative dependencies; unsupported imports fail clearly", async () => {
  const host = {
    platform: "browser",
    resolve: (ref, base) => new URL(ref, base).href,
    load: async (source) => ({ source, text: "export const n = 9;" }),
  };
  const code = await bundleScript(
    { code: `export default async () => (await import('./n.js')).n;` },
    "workspace:/flows/flow.json",
    host,
  );
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  assert.equal(await module.default(), 9);
  await assert.rejects(
    bundleScript(
      { code: `import x from 'some-package'; export default () => x;` },
      "workspace:/f.yaml",
      host,
    ),
    /Package\/builtin/,
  );
  assert.throws(
    () => moduleSource("export default (path) => import(path);", "a.js"),
    /string literal/,
  );
  assert.throws(
    () => scriptInput({ script: "a.js", code: "export default 1" }),
    /Unsupported parameter/,
  );
});

test("redirected and direct imports share the final URL module instance", async () => {
  const code = await bundleScript(
    {
      code: `import { next as a } from './redirect.js'; import { next as b } from './counter.js'; export default () => [a(), b()];`,
    },
    "https://example.test/main.js",
    {
      platform: "browser",
      resolve: (ref, base) => new URL(ref, base).href,
      load: async () => ({
        source: "https://example.test/counter.js",
        text: "let n = 0; export const next = () => ++n;",
      }),
    },
  );
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  assert.deepEqual(module.default(), [1, 2]);
});

test("script result snapshots JSON, last call wins and failures reject", async () => {
  assert.equal(await executeScript(undefined, async () => {}), null);
  assert.equal(await executeScript(null, async () => globalThis.result(globalThis.input)), null);
  assert.deepEqual(
    await executeScript({ n: 1 }, async () => {
      globalThis.result(globalThis.input);
      globalThis.input.n = 2;
      globalThis.result({ n: 3 });
      globalThis.input.n = 4;
    }),
    { n: 3 },
  );
  await assert.rejects(
    executeScript({}, async () => globalThis.result(undefined)),
    /SCRIPT_OUTPUT_NOT_JSON/,
  );
  await assert.rejects(
    executeScript({}, async () => {
      globalThis.result(1);
      throw Error("failure");
    }),
    /failure/,
  );
  assert.equal(Object.hasOwn(globalThis, "input"), false);
  assert.equal(Object.hasOwn(globalThis, "result"), false);
});
