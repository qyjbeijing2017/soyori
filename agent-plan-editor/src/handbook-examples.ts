import { stringify } from "yaml";
import catalog from "../../docs/handbook/index.json";
import { readFlowFile } from "./flow-files";
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
  const names = new Set<string>();
  for (const file of existing) {
    if (file.kind !== "file" || !/\.(json|ya?ml)$/i.test(file.path)) continue;
    try {
      names.add(readFlowFile(await file.content.text(), file.path).name.trim());
    } catch {
      // Other files in the workspace need not be valid flows.
    }
  }
  const base = `handbook-examples/${id}`;
  let directory = base;
  for (
    let n = 2;
    existing.some((f) => f.path === directory || f.path.startsWith(`${directory}/`));
    n++
  )
    directory = `${base}-${n}`;
  const files = [];
  for (const path of example.files) {
    const load = sources[`../../docs/handbook/examples/${id}/${path}`];
    if (!load) throw Error(`EXAMPLE_NOT_FOUND: ${path}`);
    let content = await load();
    if (/\.ya?ml$/i.test(path)) {
      const flow = readFlowFile(content, path);
      const baseName = flow.name.trim();
      let name = baseName;
      for (let n = 2; names.has(name); n++) name = `${baseName} ${n}`;
      names.add(name);
      if (name !== baseName) content = stringify({ ...flow, name }, { lineWidth: 0 });
    }
    files.push(
      newFile(`${directory}/${path}`, new Blob([content], { type: "text/plain;charset=utf-8" })),
    );
  }
  await writeFiles(files);
  window.dispatchEvent(new Event("agent-plan-workspace-changed"));
  return `${directory}/${example.entry}`;
}
