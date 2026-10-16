"use client";

import type { ImportedContentBlock } from "@/lib/community/imported-content-blocks";
import { PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/**
 * Imported Detail only — the source's structure (headings, lists, quotes, tables, captions, links)
 * rendered as React elements in DIBAY styling. Blocks are sanitized server-side; no HTML is injected.
 */
export function ImportedRichContent({ blocks }: { blocks: ImportedContentBlock[] }) {
  return (
    <div className="mt-4 min-w-0 space-y-3" data-testid="imported-rich-content">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return (
              <p key={i} className={PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS}>
                {b.text}
              </p>
            );
          case "h":
            return b.level === 2 ? (
              <h2 key={i} className="pt-2 text-[17px] font-bold leading-snug text-sam-fg">
                {b.text}
              </h2>
            ) : (
              <h3 key={i} className="pt-1 text-[15px] font-semibold leading-snug text-sam-fg">
                {b.text}
              </h3>
            );
          case "ul":
          case "ol": {
            const List = b.t === "ul" ? "ul" : "ol";
            return (
              <List key={i} className={`${b.t === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-5 text-[15px] leading-relaxed text-sam-fg`}>
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-sam-border bg-sam-surface-muted px-3 py-2 text-[15px] leading-relaxed text-sam-fg">
                {b.text}
              </blockquote>
            );
          case "table": {
            const [head, ...body] = b.header ? b.rows : [null, ...b.rows];
            return (
              <div key={i} className="overflow-x-auto rounded-ui-rect border border-sam-border">
                <table className="w-full border-collapse text-left text-[14px] text-sam-fg">
                  {head ? (
                    <thead className="bg-sam-surface-muted">
                      <tr>
                        {head.map((c, j) => (
                          <th key={j} className="border-b border-sam-border px-3 py-2 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {body.map((row, r) =>
                      row ? (
                        <tr key={r} className="border-t border-sam-border first:border-t-0">
                          {row.map((c, j) => (
                            <td key={j} className="px-3 py-2 align-top">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              </div>
            );
          }
          case "img":
            return (
              <figure key={i} className="my-0.5">
                <a href={b.url} target="_blank" rel="noreferrer" className="block overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- same plain <img> as the interleaved imported body */}
                  <img src={b.url} alt={b.alt ?? ""} className="h-auto w-full max-h-[min(40vh,320px)] object-contain" loading="lazy" decoding="async" />
                </a>
                {b.caption ? <figcaption className="mt-1 text-center text-[13px] text-sam-muted">{b.caption}</figcaption> : null}
              </figure>
            );
          case "link":
            return (
              <p key={i} className="text-[15px]">
                <a href={b.href} target="_blank" rel="noreferrer noopener" className="text-sam-primary underline underline-offset-2 break-all">
                  {b.text}
                </a>
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
