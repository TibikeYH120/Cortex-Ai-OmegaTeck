import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      className="prose prose-invert"
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
