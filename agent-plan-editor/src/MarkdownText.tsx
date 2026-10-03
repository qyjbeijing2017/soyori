import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownText({
  source,
  className = "",
  format,
}: {
  source: string;
  className?: string;
  format?: "yaml";
}) {
  return (
    <div className={`markdown-content ${className}`}>
      {format === "yaml" ? (
        <pre>
          <code className="language-yaml">{source}</code>
        </pre>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ node: _node, href, ...props }) => (
              <a {...props} href={href} target="_blank" rel="noopener noreferrer" />
            ),
          }}
        >
          {source}
        </ReactMarkdown>
      )}
    </div>
  );
}
