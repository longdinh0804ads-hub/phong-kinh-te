"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Render AI response markdown: bold, italic, lists, code, headings, links.
 * Loại bỏ dấu ** trong text → hiển thị bold thật sự.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("text-sm leading-relaxed space-y-2", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Inline elements
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded bg-background/60 border border-border/50 text-xs font-mono">
              {children}
            </code>
          ),

          // Block elements
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          h1: ({ children }) => <h3 className="text-base font-bold mt-3 mb-1.5">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1.5">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1">{children}</h5>,

          // Lists - đẹp với padding & spacing
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 my-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 my-1.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          // Blockquote (cho ghi chú/lưu ý)
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),

          // Code blocks
          pre: ({ children }) => (
            <pre className="bg-background/60 border border-border/50 rounded-md p-3 overflow-x-auto text-xs font-mono my-2">
              {children}
            </pre>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),

          // Tables (cho remark-gfm)
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="text-left py-1.5 px-2 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="py-1.5 px-2 border-b border-border/30">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="my-3 border-border/50" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
