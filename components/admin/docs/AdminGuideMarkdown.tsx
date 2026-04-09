"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 text-2xl font-bold tracking-tight text-gray-900 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 border-b border-gray-200 pb-2 text-xl font-semibold text-gray-900">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-lg font-medium text-gray-800">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14px] leading-relaxed text-gray-700">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-[14px] text-gray-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-[14px] text-gray-700">{children}</ol>
  ),
  li: ({ children }) => <li className="[&_p]:mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
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
  hr: () => <hr className="my-8 border-gray-200" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-gray-300 bg-gray-50 py-2 pl-4 text-[13px] text-gray-600">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-ui-rect border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50 text-gray-700">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-gray-200 px-3 py-2.5 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-gray-100 px-3 py-2.5 text-gray-700">{children}</td>
  ),
  tr: ({ children }) => <tr className="hover:bg-gray-50/80">{children}</tr>,
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code
          className={`block overflow-x-auto rounded-ui-rect bg-gray-900 p-3 font-mono text-[13px] text-gray-100 ${className ?? ""}`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[13px] text-rose-800"
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
    <article className="max-w-3xl rounded-ui-rect border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
