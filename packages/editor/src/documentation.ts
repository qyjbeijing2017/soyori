export interface DocEntry {
  id: string;
  path: string;
  title: string;
  group: string;
  summary: string;
  examples?: string[];
  sectionAliases?: Partial<Record<string, string>>;
}
// Keep the host's documentation identity stable while selecting a locale per request.
export function localizeDocumentation(
  variants: Record<string, Documentation>,
  language: () => string,
): Documentation {
  const current = () => variants[language()] ?? variants["zh-CN"];
  return {
    get version() {
      return current().version;
    },
    get entries() {
      return current().entries;
    },
    read(path) {
      const id = Object.values(variants)
        .flatMap((docs) => docs.entries)
        .find((entry) => entry.path === path)?.id;
      return current().read(id ?? path);
    },
    search(query) {
      return current().search(query);
    },
  };
}
export interface DocHeading {
  id: string;
  title: string;
  level: number;
  line: number;
  offset: number;
}
export interface Documentation {
  version: string;
  entries: readonly DocEntry[];
  read(path: string): Promise<{ entry: DocEntry; content: string; headings: DocHeading[] }>;
  search(query: string): Promise<(DocEntry & { excerpt: string })[]>;
}
export function headings(content: string): DocHeading[] {
  const found: DocHeading[] = [];
  const counts = new Map<string, number>();
  let fence = "",
    offset = 0;
  for (const [index, line] of content.split("\n").entries()) {
    const delimiter = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (delimiter) {
      if (!fence) fence = delimiter;
      else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = "";
    } else if (!fence) {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (match) {
        const title = match[2].replace(/[`*_]/g, "");
        const base = title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-|-$/g, "");
        const count = (counts.get(base) ?? 0) + 1;
        counts.set(base, count);
        found.push({
          id: count === 1 ? base : `${base}-${count}`,
          title,
          level: match[1].length,
          line: index + 1,
          offset,
        });
      }
    }
    offset += line.length + 1;
  }
  return found;
}
export function createDocumentation(
  version: string,
  entries: readonly DocEntry[],
  load: (path: string) => Promise<string>,
  loadIndex: () => Promise<{ path: string; content: string }[]>,
): Documentation {
  const cache = new Map<string, Promise<string>>();
  let index: ReturnType<typeof loadIndex> | undefined;
  return {
    version,
    entries,
    async read(path) {
      const entry = entries.find((entry) => entry.path === path || entry.id === path);
      if (!entry) throw Error("DOC_NOT_FOUND: Unknown handbook chapter.");
      let pending = cache.get(entry.path);
      if (!pending) {
        pending = load(entry.path).catch((error) => {
          cache.delete(entry.path);
          throw error;
        });
        cache.set(entry.path, pending);
      }
      const content = await pending;
      return { entry, content, headings: headings(content) };
    },
    async search(query) {
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return entries.map((entry) => ({ ...entry, excerpt: entry.summary }));
      index ??= loadIndex().catch((error) => {
        index = undefined;
        throw error;
      });
      const contents = new Map((await index).map((item) => [item.path, item.content]));
      return entries.flatMap((entry) => {
        const content = contents.get(entry.path) ?? "";
        const searchable =
          `${entry.title}\n${entry.summary}\n${entry.path}\n${content}`.toLowerCase();
        if (!words.every((word) => searchable.includes(word))) return [];
        const position = Math.max(0, content.toLowerCase().indexOf(words[0]));
        return [
          {
            ...entry,
            excerpt: content.slice(Math.max(0, position - 60), position + 220) || entry.summary,
          },
        ];
      });
    },
  };
}
