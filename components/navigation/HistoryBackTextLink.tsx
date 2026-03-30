"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

type HistoryBackTextLinkProps = {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

/**
 * 텍스트형 뒤로가기 — 히스토리 우선, 스택이 없으면 fallbackHref.
 */
export function HistoryBackTextLink({
  fallbackHref,
  className,
  children,
  "aria-label": ariaLabel = "뒤로가기",
}: HistoryBackTextLinkProps) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={() => runHistoryBackWithFallback(router, fallbackHref)}
    >
      {children}
    </button>
  );
}
