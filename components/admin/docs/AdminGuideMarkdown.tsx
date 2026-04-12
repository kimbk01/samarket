"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 text-2xl font-bold tracking-tight text-sam-fg first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 border-b border-sam-border pb-2 text-xl font-semibold text-sam-fg">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-lg font-medium text-sam-fg">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14px] leading-relaxed text-sam-fg">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-[14px] text-sam-fg">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-[14px] text-sam-fg">{children}</ol>
  ),
  li: ({ children }) => <li className="[&_p]:mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-sam-fg">{children}</strong>,
  a: ({ href, children }) => {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        className="font-medium text-signature hover:underline"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  hr: () => <hr className="my-8 border-sam-border" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-sam-border bg-sam-app py-2 pl-4 text-[13px] text-sam-muted">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-sam-app text-sam-fg">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-sam-border px-3 py-2.5 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-sam-border-soft px-3 py-2.5 text-sam-fg">{children}</td>
  ),
  tr: ({ children }) => <tr className="hover:bg-sam-app/80">{children}</tr>,
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code
          className={`block overflow-x-auto rounded-ui-rect bg-sam-ink p-3 font-mono text-[13px] text-sam-meta ${className ?? ""}`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-sam-surface-muted px-1 py-0.5 font-mono text-[13px] text-rose-800"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-ui-rect">{children}</pre>,
};

interface AdminGuideMarkdownProps {
  content: string;
}

export function AdminGuideMarkdown({ content }: AdminGuideMarkdownProps) {
  return (
    <article className="max-w-3xl rounded-ui-rect border border-sam-border bg-sam-surface px-5 py-6 shadow-sm sm:px-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
