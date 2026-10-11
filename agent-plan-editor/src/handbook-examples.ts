import catalog from "../../docs/handbook/index.json";
import { listFiles, newFile, writeFiles } from "./workspace-files";

export const handbookExamples = catalog.examples;
const sources = import.meta.glob<string>("../../docs/handbook/examples/**/*.{yaml,js}", {
  query: "?raw",
  import: "default",
});
export async function importHandbookExample(id: string) {
  const example = handbookExamples.find((example) => example.id === id);
  if (!example) throw Error("EXAMPLE_NOT_FOUND");
  const existing = await listFiles();
  const base = `handbook-examples/${id}`;
  let directory = base;
  for (
    let n = 2;
    existing.some((f) => f.path === directory || f.path.startsWith(`${directory}/`));
    n++
  )
    directory = `${base}-${n}`;
  const files = await Promise.all(
    example.files.map(async (path) => {
      const load = sources[`../../docs/handbook/examples/${id}/${path}`];
      if (!load) throw Error(`EXAMPLE_NOT_FOUND: ${path}`);
      return newFile(
        `${directory}/${path}`,
        new Blob([await load()], { type: "text/plain;charset=utf-8" }),
      );
    }),
  );
  await writeFiles(files);
  window.dispatchEvent(new Event("agent-plan-workspace-changed"));
  return `${directory}/${example.entry}`;
}
