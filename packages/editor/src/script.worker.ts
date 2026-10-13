import { initialize } from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { bundleScript, executeScript } from "soyori-script";
import { pathFromURL } from "./workspace-files";

self.onmessage = async (event) => {
  const { raw, parent, files } = event.data as {
    raw: Record<string, unknown>;
    parent?: string;
    files: { path: string; content: Blob }[];
  };
  let blobURL: string | undefined;
  try {
    await initialize({ wasmURL, worker: false });
    const code = await bundleScript(raw, parent ?? "workspace:/flow.yaml", {
      platform: "browser",
      resolve(reference, base) {
        const url = new URL(reference, base ?? "workspace:/flow.yaml");
        if (
          url.username ||
          url.password ||
          !["workspace:", "https:"].includes(url.protocol) ||
          (base?.startsWith("https:") && url.protocol !== "https:")
        )
          throw Error(`INVALID_SCRIPT: Unsupported source ${reference}`);
        if (url.protocol === "workspace:") pathFromURL(url.href);
        return url.href;
      },
      async load(source) {
        if (source.startsWith("workspace:")) {
          const file = files.find((file) => file.path === pathFromURL(source));
          if (!file) throw Error(`SCRIPT_NOT_FOUND: ${source}`);
          if (file.content.size > 2 * 1024 * 1024) throw Error("SCRIPT_TOO_LARGE");
          return { source, text: await file.content.text() };
        }
        const response = await fetch(source, { credentials: "omit" });
        if (!response.ok || !response.url.startsWith("https:"))
          throw Error(`SCRIPT_HTTP_ERROR: ${source}`);
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader)
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) {
              await reader.cancel();
              throw Error("SCRIPT_TOO_LARGE");
            }
            chunks.push(value);
          }
        return { source: response.url, text: await new Blob(chunks as BlobPart[]).text() };
      },
    });
    blobURL = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const result = await executeScript(raw.input, () => import(/* @vite-ignore */ blobURL!));
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (blobURL) URL.revokeObjectURL(blobURL);
  }
};
