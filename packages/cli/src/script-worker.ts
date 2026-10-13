import { createReadStream } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { build } from "esbuild";
import { bundleScript, executeScript } from "soyori-script";
import { resolveSource } from "./flow-source.js";
import { CliError, failure } from "./protocol.js";

const MAX_BYTES = 2 * 1024 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

async function readBounded(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const buffers: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of chunks) {
    length += chunk.length;
    if (length > MAX_BYTES) throw new CliError("SCRIPT_TOO_LARGE", "Script exceeds 2 MiB.");
    buffers.push(chunk);
  }
  return Buffer.concat(buffers).toString("utf8");
}

async function load(source: string): Promise<{ source: string; text: string }> {
  if (source.startsWith("file:"))
    return { source, text: await readBounded(createReadStream(new URL(source))) };
  let current = source;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const url = new URL(current);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new CliError("INVALID_SCRIPT", "Remote scripts require HTTPS without URL credentials.");
    const response = await fetch(url, { redirect: "manual" });
    if (REDIRECTS.has(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirects === 5)
        throw new CliError("SCRIPT_HTTP_ERROR", "Invalid or excessive script redirects.");
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new CliError("SCRIPT_HTTP_ERROR", `Script request returned HTTP ${response.status}.`);
    }
    return { source: current, text: response.body ? await readBounded(response.body) : "" };
  }
  throw new CliError("SCRIPT_HTTP_ERROR", "Cannot fetch script.");
}

async function execute(): Promise<unknown> {
  const { code: inline, input, source } = workerData;
  const code = await bundleScript(
    { code: inline },
    source,
    {
      platform: "node",
      resolve: resolveSource,
      load,
      directory: (url) => (url.startsWith("file:") ? dirname(fileURLToPath(url)) : undefined),
    },
    build,
  );
  return executeScript(
    input,
    () => import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`),
  );
}

// Unresolved promises must stay alive until the CLI supervisor's timeout/cancellation.
const keepAlive = setInterval(() => {}, 60_000);
void execute()
  .then(
    (result) => parentPort?.postMessage({ ok: true, result }),
    (error: unknown) => parentPort?.postMessage({ ok: false, error: failure(error) }),
  )
  .finally(() => clearInterval(keepAlive));
