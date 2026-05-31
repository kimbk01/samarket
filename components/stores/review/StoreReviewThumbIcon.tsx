"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";

/** Menu review vote icons — Lucide only (no custom SVG paths). */
export function StoreReviewThumbIcon({
  variant,
  className = "h-5 w-5 shrink-0",
  filled = false,
}: {
  variant: "up" | "down";
  className?: string;
  filled?: boolean;
}) {
  const Icon = variant === "up" ? ThumbsUp : ThumbsDown;
  return (
    <Icon
      className={className}
      aria-hidden
      strokeWidth={2}
      fill={filled ? "currentColor" : "none"}
    />
  );
}

export function storeReviewThumbVoteButtonClass(
  vote: "up" | "down" | null | undefined,
  target: "up" | "down"
): string {
  const active = vote === target;
  const base =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border transition-colors active:scale-95";
  if (active && target === "up") {
    return `${base} border-blue-200 bg-blue-50 text-blue-600`;
  }
  if (active && target === "down") {
    return `${base} border-rose-200 bg-rose-50 text-rose-600`;
  }
  return `${base} border-[color:var(--delivery-border,#e5e7eb)] bg-[color:var(--delivery-primary-soft,#f5f0eb)] text-[color:var(--delivery-dark,#374151)]/65`;
}
