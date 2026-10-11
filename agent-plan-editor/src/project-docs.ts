import catalog from "../../docs/handbook/index.json";
import { createDocumentation } from "./documentation";

const chapters = import.meta.glob<string>("../../docs/handbook/**/*.md", {
  query: "?raw",
  import: "default",
});
export const projectDocs = createDocumentation(
  catalog.version,
  catalog.chapters,
  async (path) => {
    const load = chapters[`../../${path}`];
    if (!load) throw Error("DOC_NOT_FOUND: Handbook file missing.");
    return load();
  },
  async () => (await import("virtual:handbook-search")).default,
);
