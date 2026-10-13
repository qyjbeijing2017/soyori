import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CliError } from "./protocol.js";

const MAX_BYTES = 2 * 1024 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

async function readBounded(chunks: AsyncIterable<Uint8Array>, source: string): Promise<string> {
  const buffers: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of chunks) {
    length += chunk.length;
    if (length > MAX_BYTES)
      throw new CliError("FLOW_TOO_LARGE", `Flow exceeds ${MAX_BYTES} bytes: ${source}`);
    buffers.push(chunk);
  }
  return Buffer.concat(buffers).toString("utf8");
}

/** Resolve against the importing document, never the process working directory. */
export async function resolveSource(reference: string, parent?: string): Promise<string> {
  const remote = parent !== undefined && /^https?:/.test(parent);
  const localPath = /^[a-z]:[/\\]/i.test(reference) || reference.startsWith("\\\\");
  if (remote && (localPath || /^file:/i.test(reference))) {
    throw new CliError("INVALID_IMPORT", `Remote flow cannot import local file: ${reference}`);
  }
  let url: URL;
  if (localPath || (!parent && !/^[a-z][a-z\d+.-]*:/i.test(reference))) {
    url = pathToFileURL(resolve(reference));
  } else if (parent?.startsWith("file:") && isAbsolute(reference)) {
    url = pathToFileURL(reference);
  } else if (parent?.startsWith("file:") && !/^[a-z][a-z\d+.-]*:/i.test(reference)) {
    url = pathToFileURL(resolve(dirname(fileURLToPath(parent)), reference));
  } else {
    try {
      url = new URL(reference, parent);
    } catch {
      throw new CliError("INVALID_IMPORT", `Invalid flow source: ${reference}`);
    }
  }
  url.hash = "";
  if (url.protocol === "file:") {
    // URL parsing normalizes leading whitespace; enforce the boundary on the parsed URL too.
    if (remote) throw new CliError("INVALID_IMPORT", "Remote flow cannot import a file URL.");
    try {
      return pathToFileURL(await realpath(fileURLToPath(url))).href;
    } catch {
      throw new CliError("FILE_READ_ERROR", `Cannot read flow: ${url.href}`);
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError("INVALID_IMPORT", `Unsupported flow protocol: ${url.protocol}`);
  }
  if (url.username || url.password)
    throw new CliError("INVALID_IMPORT", "Credentials in flow URLs are not supported.");
  return url.href;
}

export async function readSource(source: string): Promise<{ source: string; text: string }> {
  if (source.startsWith("file:")) {
    try {
      return { source, text: await readBounded(createReadStream(new URL(source)), source) };
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError("FILE_READ_ERROR", `Cannot read flow: ${source}`);
    }
  }
  const signal = AbortSignal.timeout(10_000);
  let current = source;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetch(current, { redirect: "manual", signal });
      if (REDIRECTS.has(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 5)
          throw new CliError("HTTP_ERROR", `Invalid or excessive redirects: ${current}`);
        current = await resolveSource(location, current);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new CliError("HTTP_ERROR", `HTTP ${response.status}: ${current}`);
      }
      return {
        source: current,
        text: response.body ? await readBounded(response.body, current) : "",
      };
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      "HTTP_ERROR",
      `Cannot fetch flow ${current}: ${error instanceof Error ? error.message : "Request failed"}`,
    );
  }
  throw new CliError("HTTP_ERROR", `Cannot fetch flow: ${current}`);
}
