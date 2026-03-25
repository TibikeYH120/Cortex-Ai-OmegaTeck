import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace("language-", "") || "code";

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/8 bg-black/60">
      <div className="flex items-center justify-between px-4 py-2 bg-white/4 border-b border-white/6">
        <span className="font-mono text-[10px] tracking-widest text-[#00d0ff]/70 uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono text-muted hover:text-white hover:bg-white/8 transition-all"
        >
          {copied ? <Check size={11} className="text-[#00ff88]" /> : <Copy size={11} />}
          {copied ? "Másolva" : "Másolás"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 m-0 bg-transparent">
        <code className="font-mono text-[13px] leading-relaxed text-[#9dd0ff]">{children}</code>
      </pre>
    </div>
  );
}

function InlineCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 ml-1 opacity-0 group-hover:opacity-100 text-[10px] text-muted hover:text-white transition-all"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-cx">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const isBlock = !!(props as any).style || className?.startsWith("language-");
            const codeString = String(children).replace(/\n$/, "");
            if (isBlock || className?.startsWith("language-")) {
              return <CodeBlock className={className}>{codeString}</CodeBlock>;
            }
            return (
              <code className="font-mono text-[13px] bg-[#00d0ff]/8 text-[#00d0ff] px-1.5 py-0.5 rounded border border-[#00d0ff]/12" {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed text-foreground/90">{children}</p>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold text-[#00d0ff] font-sans mt-5 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold text-[#00d0ff] font-sans mt-4 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-[#00d0ff]/80 font-sans mt-3 mb-1">{children}</h3>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1 text-foreground/85">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-1 text-foreground/85">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          strong({ children }) {
            return <strong className="text-white font-semibold">{children}</strong>;
          },
          em({ children }) {
            return <em className="text-foreground/70 italic">{children}</em>;
          },
          a({ children, href }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#6c3bff] hover:text-[#00d0ff] underline underline-offset-2 transition-colors">{children}</a>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-[#00d0ff]/40 pl-4 my-3 text-foreground/70 italic">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4 rounded-xl border border-white/8">
                <table className="w-full text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-white/4 border-b border-white/8">{children}</thead>;
          },
          th({ children }) {
            return <th className="px-4 py-2 text-left text-[#00d0ff] font-mono text-xs uppercase tracking-wider">{children}</th>;
          },
          td({ children }) {
            return <td className="px-4 py-2 border-b border-white/4 text-foreground/80">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
