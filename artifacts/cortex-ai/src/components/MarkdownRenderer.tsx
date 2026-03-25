import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Eye, EyeOff, ExternalLink, Loader2 } from "lucide-react";

const PREVIEWABLE = new Set(["html", "jsx", "tsx", "react"]);

function buildPreviewSrc(code: string, language: string): string {
  const darkStyle = `
    * { box-sizing: border-box; }
    body { background: #0a0a12; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; padding: 16px; margin: 0; }
    button { cursor: pointer; }
    input, textarea, select { background: #1a1a2e; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 10px; }
    #cx-error { color: #f87171; font-family: monospace; font-size: 12px; padding: 12px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; white-space: pre-wrap; margin-top: 8px; }
  `;

  if (language === "html") {
    // Direct HTML preview — most reliable, no CDN needed
    const hasHtmlTag = /<html/i.test(code);
    if (hasHtmlTag) return code;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${darkStyle}</style></head><body>${code}</body></html>`;
  }

  // JSX / TSX / React — uses window.onload to guarantee Babel is ready
  const escaped = JSON.stringify(code); // safely escape the code string

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${darkStyle}
    #cx-loading { display:flex; align-items:center; gap:8px; color:rgba(255,255,255,0.4); font-family:monospace; font-size:12px; padding:12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #cx-spinner { width:14px; height:14px; border:2px solid rgba(0,208,255,0.3); border-top-color:#00d0ff; border-radius:50%; animation: spin 0.8s linear infinite; }
  </style>
</head>
<body>
  <div id="root"><div id="cx-loading"><div id="cx-spinner"></div> Loading preview...</div></div>

  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script>
    // window.onload fires AFTER all scripts (including CDN) finish loading
    window.addEventListener('load', function () {
      var root = document.getElementById('root');
      try {
        var rawCode = ${escaped};

        // Strip import/export for sandbox
        var sandboxCode = rawCode
          .replace(/^import\\s[\\s\\S]*?;\\s*$/gm, '')
          .replace(/^export\\s+default\\s+/gm, '')
          .replace(/^export\\s+/gm, '')
          .trim();

        // Transform JSX -> JS using Babel
        var transformed = Babel.transform(sandboxCode, {
          presets: ['react'],
          filename: 'preview.jsx'
        }).code;

        // Execute in sandbox scope with React in scope
        var fn = new Function('React', 'ReactDOM', transformed + '\\n; return typeof App !== "undefined" ? App : typeof Component !== "undefined" ? Component : null;');
        var Comp = fn(React, ReactDOM);

        if (Comp) {
          ReactDOM.createRoot(root).render(React.createElement(Comp));
        } else {
          root.innerHTML = '<div id="cx-error">No default component found.\\nMake sure your component is named App or Component.</div>';
        }
      } catch (e) {
        root.innerHTML = '<div id="cx-error">Preview error: ' + e.message + '</div>';
      }
    });
  </script>
</body>
</html>`;
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const language = className?.replace("language-", "") || "code";
  const canPreview = PREVIEWABLE.has(language);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTogglePreview = () => {
    if (!showPreview) setIframeLoading(true);
    setShowPreview(p => !p);
  };

  let previewSrc: string | null = null;
  if (canPreview && showPreview) {
    try {
      previewSrc = buildPreviewSrc(children, language);
    } catch {
      previewSrc = null;
    }
  }

  const openInTab = () => {
    if (!previewSrc) return;
    const blob = new Blob([previewSrc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/8 bg-black/60">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/4 border-b border-white/6">
        <span className="font-mono text-[10px] tracking-widest text-[#00d0ff]/70 uppercase">{language}</span>
        <div className="flex items-center gap-1">
          {canPreview && (
            <button
              onClick={handleTogglePreview}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all"
              style={showPreview
                ? { color: "#00d0ff", background: "rgba(0,208,255,0.12)", border: "1px solid rgba(0,208,255,0.3)" }
                : { color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }
              }
            >
              {showPreview ? <EyeOff size={11} /> : <Eye size={11} />}
              {showPreview ? "Hide" : "Preview"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono text-muted hover:text-white hover:bg-white/8 transition-all"
          >
            {copied ? <Check size={11} className="text-[#00ff88]" /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Live Preview Panel */}
      {showPreview && previewSrc && (
        <div className="border-b border-white/6">
          <div className="flex items-center justify-between px-4 py-1.5" style={{ background: "rgba(0,208,255,0.04)", borderBottom: "1px solid rgba(0,208,255,0.08)" }}>
            <div className="flex items-center gap-2">
              {iframeLoading && <Loader2 size={10} className="text-[#00d0ff]/60 animate-spin" />}
              <span className="font-mono text-[9px] text-[#00d0ff]/60 uppercase tracking-widest">
                {iframeLoading ? "Loading preview..." : "Live Preview"}
              </span>
            </div>
            <button
              onClick={openInTab}
              className="flex items-center gap-1 text-[9px] font-mono text-muted/50 hover:text-[#00d0ff] transition-colors"
            >
              <ExternalLink size={9} /> Open in new tab
            </button>
          </div>
          <iframe
            srcDoc={previewSrc}
            sandbox="allow-scripts"
            className="w-full bg-[#0a0a12]"
            style={{ height: "340px", border: "none", display: "block" }}
            title="Code preview"
            onLoad={() => setIframeLoading(false)}
          />
        </div>
      )}

      {/* Code */}
      <pre className="overflow-x-auto p-4 m-0 bg-transparent">
        <code className="font-mono text-[13px] leading-relaxed text-[#9dd0ff]">{children}</code>
      </pre>
    </div>
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
