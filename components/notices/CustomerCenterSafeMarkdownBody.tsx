"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  parseCustomerCenterSafeMarkdown,
  safeInlineNodes,
} from "@/lib/notices/customer-center-safe-markdown";

function Inline({ text }: { text: string }) {
  return (
    <>
      {safeInlineNodes(text).map((n) => {
        if (n.kind === "bold") return <strong key={n.key}>{n.text}</strong>;
        if (n.kind === "italic") return <em key={n.key}>{n.text}</em>;
        if (n.kind === "link" && n.href) {
          return (
            <a
              key={n.key}
              href={n.href}
              className="text-signature underline break-all"
              rel="noopener noreferrer"
              target={n.href.startsWith("/") ? undefined : "_blank"}
            >
              {n.text}
            </a>
          );
        }
        return <span key={n.key}>{n.text}</span>;
      })}
    </>
  );
}

export function CustomerCenterSafeMarkdownBody({ body }: { body: string }) {
  const blocks = parseCustomerCenterSafeMarkdown(body || "");
  if (blocks.length === 0) {
    return <p className="sam-text-body text-sam-muted">—</p>;
  }
  return (
    <div className="space-y-3 break-words sam-text-body text-sam-fg [overflow-wrap:anywhere]">
      {blocks.map((b, idx) => {
        const key = `${b.type}-${idx}`;
        if (b.type === "h2") {
          return (
            <h2 key={key} className="text-lg font-semibold text-sam-fg">
              <Inline text={b.text} />
            </h2>
          );
        }
        if (b.type === "h3") {
          return (
            <h3 key={key} className="text-base font-semibold text-sam-fg">
              <Inline text={b.text} />
            </h3>
          );
        }
        if (b.type === "quote") {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-sam-border pl-3 text-sam-muted"
            >
              <Inline text={b.text} />
            </blockquote>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {b.items.map((item, j) => (
                <li key={`${key}-${j}`}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {b.items.map((item, j) => (
                <li key={`${key}-${j}`}>
                  <Inline text={item} />
                </li>
              ))}
            </ol>
          );
        }
        if (b.type === "image") {
          return (
            <div
              key={key}
              className="relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-ui-rect border border-sam-border"
            >
              <SamarketThumbnail
                src={b.src}
                alt={b.alt || ""}
                fill
                fetchDisplayPx={800}
                className="h-full w-full"
                imageClassName="object-cover"
                roundedClassName="rounded-ui-rect"
              />
            </div>
          );
        }
        if (b.type === "html_blocked") {
          return (
            <p key={key} className="whitespace-pre-wrap text-sam-muted">
              {b.text || "—"}
            </p>
          );
        }
        if (b.type === "p") {
          return (
            <p key={key} className="whitespace-pre-wrap">
              <Inline text={b.text} />
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
