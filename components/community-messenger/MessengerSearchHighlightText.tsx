"use client";

import type { ReactNode } from "react";

type HighlightRange = { start: number; end: number };

type Props = {
  text: string;
  ranges: HighlightRange[];
  /** Muted (non-match) portion class */
  mutedClassName?: string;
  strongClassName?: string;
  prefix?: string;
};

/** Renders text with matched spans bold and others muted. */
export function MessengerSearchHighlightText({
  text,
  ranges,
  mutedClassName = "text-[color:var(--messenger-text-secondary)] font-normal",
  strongClassName = "font-semibold text-[color:var(--messenger-text)]",
  prefix = "",
}: Props) {
  if (!ranges.length) {
    return (
      <>
        {prefix}
        <span className={mutedClassName}>{text}</span>
      </>
    );
  }

  const sorted = [...ranges]
    .filter((r) => r.end > r.start && r.start >= 0 && r.end <= text.length)
    .sort((a, b) => a.start - b.start);

  if (!sorted.length) {
    return (
      <>
        {prefix}
        <span className={mutedClassName}>{text}</span>
      </>
    );
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor) {
      parts.push(
        <span key={`m-${cursor}`} className={mutedClassName}>
          {text.slice(cursor, range.start)}
        </span>
      );
    }
    parts.push(
      <strong key={`s-${range.start}`} className={strongClassName}>
        {text.slice(range.start, range.end)}
      </strong>
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push(
      <span key={`m-tail-${cursor}`} className={mutedClassName}>
        {text.slice(cursor)}
      </span>
    );
  }

  return (
    <>
      {prefix}
      {parts}
    </>
  );
}
