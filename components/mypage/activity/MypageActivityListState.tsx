"use client";

import type { ReactNode } from "react";

/**
 * Slice 5 — Activity list empty/loading/error chrome (trade hub surfaces).
 * DO NOT invent a second empty pattern per page.
 */
export function MypageActivityListLoading({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-2 py-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-[4.25rem] animate-pulse rounded-ui-rect bg-sam-surface-muted/90" />
      ))}
    </ul>
  );
}

export function MypageActivityListEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="py-12 text-center sam-text-body text-sam-muted" data-testid="mypage-activity-empty">
      {children}
    </p>
  );
}

export function MypageActivityListError({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center sam-text-body text-sam-danger" data-testid="mypage-activity-error" role="alert">
      {children}
    </p>
  );
}
