"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  sanitizeCustomerCenterMarkdownHref,
  sanitizeCustomerCenterMarkdownImageSrc,
} from "@/lib/notices/customer-center-safe-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h2 className="mt-4 text-xl font-semibold text-sam-fg first:mt-0 break-words">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 text-lg font-semibold text-sam-fg first:mt-0 break-words">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 text-base font-semibold text-sam-fg first:mt-0 break-words">{children}</h3>
  ),
  h4: ({ children }) => (
    <h3 className="mt-3 text-base font-medium text-sam-fg first:mt-0 break-words">{children}</h3>
  ),
  h5: ({ children }) => (
    <p className="mt-2 font-medium text-sam-fg break-words">{children}</p>
  ),
  h6: ({ children }) => (
    <p className="mt-2 font-medium text-sam-fg break-words">{children}</p>
  ),
  p: ({ children }) => (
    <p className="mb-3 whitespace-pre-wrap break-words sam-text-body leading-relaxed text-sam-fg last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 sam-text-body text-sam-fg break-words">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 sam-text-body text-sam-fg break-words">{children}</ol>
  ),
  li: ({ children }) => <li className="break-words [&_p]:mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-sam-fg">{children}</strong>,
  em: ({ children }) => <em className="italic text-sam-fg">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-sam-border bg-sam-app py-2 pl-4 sam-text-body-secondary text-sam-muted break-words">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-sam-border" />,
  a: ({ href, children }) => {
    const safe = sanitizeCustomerCenterMarkdownHref(href);
    if (!safe) {
      return <span className="break-words text-sam-fg">{children}</span>;
    }
    const external = safe.startsWith("http");
    return (
      <a
        href={safe}
        className="break-words font-medium text-signature underline-offset-2 hover:underline"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    const safe = sanitizeCustomerCenterMarkdownImageSrc(typeof src === "string" ? src : null);
    if (!safe) return null;
    return (
      <span className="relative my-3 block aspect-[16/9] w-full max-w-full overflow-hidden rounded-ui-rect border border-sam-border">
        <SamarketThumbnail
          src={safe}
          alt={typeof alt === "string" ? alt : ""}
          fill
          fetchDisplayPx={900}
          className="h-full w-full"
          imageClassName="object-contain"
          roundedClassName="rounded-ui-rect"
        />
      </span>
    );
  },
  code: ({ children }) => (
    <code className="break-all rounded bg-sam-surface-muted px-1 py-0.5 font-mono text-[0.9em] text-sam-fg">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-ui-rect bg-sam-app p-3">
      {children}
    </pre>
  ),
  /** Disallow tables / raw html nodes by rendering nothing unusual — default md has no raw HTML without rehype-raw. */
  table: () => null,
  thead: () => null,
  tbody: () => null,
  tr: () => null,
  th: () => null,
  td: () => null,
};

/**
 * Shared Member Detail + Admin preview renderer.
 * Plain text remains readable; limited markdown is formatted. Raw HTML is not executed.
 */
export function CustomerCenterSafeMarkdownBody({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 max-w-full overflow-x-hidden ${className ?? ""}`}>
      <ReactMarkdown
        skipHtml
        urlTransform={(url) => {
          const asImg = sanitizeCustomerCenterMarkdownImageSrc(url);
          if (asImg) return asImg;
          const asHref = sanitizeCustomerCenterMarkdownHref(url);
          return asHref ?? "";
        }}
        components={components}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
