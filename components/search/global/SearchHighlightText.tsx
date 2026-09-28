"use client";

import { buildSearchHighlightSegments } from "@/lib/search/global/semantics/highlight";

export function SearchHighlightText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const segments = buildSearchHighlightSegments(text, query);
  return (
    <span className={className} data-search-highlight-root="true">
      {segments.map((seg, i) =>
        seg.matched ? (
          <mark
            key={i}
            data-search-highlight="true"
            className="bg-transparent p-0 font-semibold text-[var(--dibay-green)]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}
