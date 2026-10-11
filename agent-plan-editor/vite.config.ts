import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "handbook-search",
      handleHotUpdate({ file, server }) {
        if (file.replaceAll("\\", "/").includes("/docs/handbook/")) {
          // Lazy text modules and the derived index must refresh together in development.
          server.ws.send({ type: "full-reload" });
          return [];
        }
      },
      resolveId(id) {
        if (id === "virtual:handbook-search") return "\0handbook-search";
      },
      async load(id) {
        if (id !== "\0handbook-search") return;
        const catalogPath = fileURLToPath(new URL("../docs/handbook/index.json", import.meta.url));
        this.addWatchFile(catalogPath);
        const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
          chapters: { path: string }[];
        };
        const index = await Promise.all(
          catalog.chapters.map(async ({ path }) => {
            const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
            this.addWatchFile(filename);
            return { path, content: await readFile(filename, "utf8") };
          }),
        );
        return `export default ${JSON.stringify(index)}`;
      },
    },
  ],
  worker: { format: "es" },
});
