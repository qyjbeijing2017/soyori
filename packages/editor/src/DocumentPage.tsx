import { Button, Drawer, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { createElement, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocEntry, Documentation } from "./documentation";
import { importHandbookExample } from "./handbook-examples";
import { tr } from "./i18n";
import { getHandbookExamples, getProjectDocs, projectDocs } from "./project-docs";

const handbookImages = import.meta.glob<string>("../../../docs/handbook/images/**/*.{jpg,svg}", {
  query: "?url",
  import: "default",
  eager: true,
});

function route() {
  const [id, section] = location.hash
    .slice(1)
    .split("/")
    .slice(1)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return "";
      }
    });
  return {
    id: projectDocs.entries.some((e) => e.id === id) ? id : "introduction",
    section: section ?? "",
  };
}
function textOf(node: { value?: string; children?: unknown[] }): string {
  return (
    node.value ??
    node.children?.map((child) => textOf(child as Parameters<typeof textOf>[0])).join("") ??
    ""
  );
}
export default function DocumentPage({
  onOpenExample,
}: {
  onOpenExample: (path: string) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const docs = getProjectDocs(i18n.language);
  const handbookExamples = getHandbookExamples(i18n.language);
  const mobile = useMediaQuery("(max-width: 48em)");
  const [selected, setSelected] = useState(() => route().id);
  const [section, setSection] = useState(() => route().section);
  const [article, setArticle] = useState<Awaited<ReturnType<Documentation["read"]>>>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(DocEntry & { excerpt: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [notice, setNotice] = useState("");
  const [opened, setOpened] = useState(false);
  const [retry, setRetry] = useState(0);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Record<string, string>>({});
  const articleRef = useRef<HTMLElement>(null);
  function navigate(id: string, anchor = "") {
    setSelected(id);
    setSection(anchor);
    setOpened(false);
    const hash = `#document/${id}${anchor ? `/${encodeURIComponent(anchor)}` : ""}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
  useEffect(() => {
    const update = () => {
      const next = route();
      setSelected(next.id);
      setSection(next.section);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly restarts a failed chapter load.
  useEffect(() => {
    let active = true;
    setArticle(undefined);
    setError("");
    setNotice("");
    void docs
      .read(selected)
      .then((value) => {
        if (active) setArticle(value);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [selected, retry, docs]);
  useEffect(() => {
    if (article) {
      if (section)
        document
          .getElementById(`doc-${article.entry.sectionAliases?.[section] ?? section}`)
          ?.scrollIntoView({ block: "start" });
      else articleRef.current?.scrollTo({ top: 0 });
    }
  }, [article, section]);
  useEffect(() => {
    let active = true;
    setSearchError("");
    setResults([]);
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void docs
        .search(query)
        .then((items) => {
          if (active) setResults(items);
        })
        .catch((cause) => {
          if (active) setSearchError(String(cause));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, docs]);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(tr("已复制"));
    } catch {
      setNotice(tr("复制失败，请手动选择内容。"));
    }
  }
  const heading: NonNullable<Components["h2"]> = ({ node, children }) => {
    const item = article?.headings.find((h) => h.line === node?.position?.start.line);
    return createElement(
      node?.tagName ?? "h2",
      { id: item ? `doc-${item.id}` : undefined },
      children,
    );
  };
  const navigation = (
    <nav className="document-chapters" aria-label={tr("手册目录")}>
      {[...new Set(projectDocs.entries.map((e) => e.group))].map((group) => (
        <div key={group}>
          <strong>{tr(group)}</strong>
          {projectDocs.entries
            .filter((e) => e.group === group)
            .map((entry) => (
              <UnstyledButton
                key={entry.id}
                className="document-chapter"
                aria-current={entry.id === selected ? "page" : undefined}
                onClick={() => navigate(entry.id)}
              >
                {entry.title}
              </UnstyledButton>
            ))}
        </div>
      ))}
    </nav>
  );
  return (
    <section className="document-page">
      <header className="document-header">
        <div>
          <h1>Document</h1>
          <small>
            {tr("使用手册")} · {projectDocs.version}
          </small>
        </div>
        {mobile && (
          <Button variant="light" onClick={() => setOpened(true)}>
            {tr("手册目录")}
          </Button>
        )}
        <TextInput
          aria-label={tr("搜索手册")}
          placeholder={tr("搜索手册")}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </header>
      <div className="document-body">
        {!mobile && <aside className="document-sidebar">{navigation}</aside>}
        <article ref={articleRef} className="document-article" aria-busy={!article && !error}>
          {query.trim() && (
            <section className="document-search" aria-label={tr("搜索结果")}>
              <div className="document-actions">
                <strong>{tr("搜索结果")}</strong>
                <Button variant="subtle" onClick={() => setQuery("")}>
                  {tr("清除搜索")}
                </Button>
              </div>
              {searching ? (
                <p role="status">{tr("正在搜索…")}</p>
              ) : searchError ? (
                <p role="alert">{searchError}</p>
              ) : !results.length ? (
                <p>{tr("没有匹配的章节。")}</p>
              ) : (
                results.map((entry) => (
                  <UnstyledButton
                    className="document-search-result"
                    key={entry.id}
                    onClick={() => {
                      navigate(entry.id);
                      setQuery("");
                    }}
                  >
                    <strong>{entry.title}</strong>
                    <span>{entry.excerpt}</span>
                  </UnstyledButton>
                ))
              )}
            </section>
          )}
          {error ? (
            <div role="alert">
              <p>{error}</p>
              <Button onClick={() => setRetry((value) => value + 1)}>{tr("重试")}</Button>
            </div>
          ) : !article ? (
            <p role="status">{tr("正在加载章节…")}</p>
          ) : (
            <>
              <div className="document-actions">
                <small>
                  {tr(article.entry.group)} / {article.entry.title}
                </small>
                <Button
                  variant="subtle"
                  onClick={() =>
                    void copy(
                      `${location.origin}${location.pathname}${location.search}#document/${selected}${section ? `/${encodeURIComponent(section)}` : ""}`,
                    )
                  }
                >
                  {tr("复制章节链接")}
                </Button>
              </div>
              <details className="document-toc">
                <summary>{tr("本页目录")}</summary>
                {article.headings
                  .filter((h) => h.level > 1)
                  .map((h) => (
                    <a
                      key={h.id}
                      href={`#document/${selected}/${encodeURIComponent(h.id)}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(selected, h.id);
                      }}
                    >
                      {h.title}
                    </a>
                  ))}
              </details>
              <div className="markdown-content document-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    h1: heading,
                    h2: heading,
                    h3: heading,
                    h4: heading,
                    h5: heading,
                    h6: heading,
                    img: ({ src, alt }) => {
                      const path = new URL(
                        src ?? "",
                        `https://handbook.local/${article.entry.path}`,
                      ).pathname;
                      const image = handbookImages[`../../../${path.slice(1)}`];
                      return <img src={image} alt={alt} loading="lazy" />;
                    },
                    pre: ({ node, children }) => (
                      <div className="document-code">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => void copy(textOf(node ?? {}))}
                        >
                          {tr("复制代码")}
                        </Button>
                        <pre>{children}</pre>
                      </div>
                    ),
                    a: ({ href, children }) => {
                      const target = href
                        ? new URL(href, `https://handbook.local/${article.entry.path}`)
                        : null;
                      const entry =
                        target?.origin === "https://handbook.local"
                          ? projectDocs.entries.find((e) => `/${e.path}` === target.pathname)
                          : undefined;
                      if (entry)
                        return (
                          <a
                            href={`#document/${entry.id}${target?.hash ? `/${encodeURIComponent(decodeURIComponent(target.hash.slice(1)))}` : ""}`}
                            onClick={(event) => {
                              event.preventDefault();
                              navigate(entry.id, decodeURIComponent(target?.hash.slice(1) ?? ""));
                            }}
                          >
                            {children}
                          </a>
                        );
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {article.content}
                </ReactMarkdown>
              </div>
              {article.entry.examples?.map((id) => {
                const example = handbookExamples.find((example) => example.id === id);
                return (
                  <div key={id} className="document-example">
                    <strong>{example?.title}</strong>
                    <Button
                      disabled={importing}
                      onClick={() => {
                        setImporting(true);
                        setNotice("");
                        void importHandbookExample(id, i18n.language)
                          .then((path) => {
                            setImported((current) => ({ ...current, [id]: path }));
                            setNotice(tr("示例已导入：{{path}}", { path }));
                          })
                          .catch((cause) => setNotice(String(cause)))
                          .finally(() => setImporting(false));
                      }}
                    >
                      {tr("导入示例")}
                    </Button>
                    {imported[id] && (
                      <Button
                        variant="light"
                        disabled={importing}
                        onClick={() => {
                          setImporting(true);
                          void onOpenExample(imported[id])
                            .catch((cause) => setNotice(String(cause)))
                            .finally(() => setImporting(false));
                        }}
                      >
                        {tr("在编辑器打开")}
                      </Button>
                    )}
                    {imported[id] && <small>{imported[id]}</small>}
                  </div>
                );
              })}
              <footer className="document-source">
                {article.entry.path} · {projectDocs.version}
              </footer>
            </>
          )}
        </article>
      </div>
      {notice && (
        <div className="document-notice" role="status">
          {notice}
        </div>
      )}
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={tr("手册目录")}
        closeButtonProps={{ "aria-label": tr("关闭目录") }}
        size="min(90vw, 360px)"
      >
        {navigation}
      </Drawer>
    </section>
  );
}
