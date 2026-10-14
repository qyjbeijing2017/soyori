import english from "../../../docs/handbook/en/index.json";
import catalog from "../../../docs/handbook/index.json";
import { createDocumentation, type DocEntry, localizeDocumentation } from "./documentation";
import i18n from "./i18n";

const chapters = import.meta.glob<string>("../../../docs/handbook/**/*.md", {
  query: "?raw",
  import: "default",
});
function create(
  catalog: { version: string; chapters: readonly DocEntry[] },
  loadIndex: Parameters<typeof createDocumentation>[3],
) {
  return createDocumentation(
    catalog.version,
    catalog.chapters,
    async (path) => {
      const load = chapters[`../../../${path}`];
      if (!load) throw Error("DOC_NOT_FOUND: Handbook file missing.");
      return load();
    },
    loadIndex,
  );
}
const variants = {
  "zh-CN": create(
    {
      ...catalog,
      chapters: catalog.chapters.map((entry) => {
        const translated = english.chapters.find((chapter) => chapter.id === entry.id);
        return {
          ...entry,
          sectionAliases: Object.fromEntries(
            Object.entries(translated?.sectionAliases ?? {}).map(([zh, en]) => [en, zh]),
          ),
        };
      }),
    },
    async () => (await import("virtual:handbook-search")).default,
  ),
  en: create(english, async () => (await import("virtual:handbook-search/en")).default),
};
export function getProjectDocs(language: string) {
  return language === "en" ? variants.en : variants["zh-CN"];
}
export function getHandbookExamples(language: string) {
  return language === "en" ? english.examples : catalog.examples;
}
export const projectDocs = localizeDocumentation(variants, () => i18n.language);
