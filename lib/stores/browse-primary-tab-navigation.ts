"use client";

/**
 * browse 헤더 1차 탭 ↔ pathname 갱신 전 optimistic highlight.
 * (2차 `browse-sub-chip-navigation` 와 동일 패턴)
 */
let optimisticPrimarySlug: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

export function setBrowsePrimaryTabOptimisticSlug(slug: string | null): void {
  optimisticPrimarySlug = slug?.trim().toLowerCase() || null;
  bump();
}

export function subscribeBrowsePrimaryTabOptimisticSlug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowsePrimaryTabOptimisticSlugSnapshot(): string | null {
  return optimisticPrimarySlug;
}

export function getBrowsePrimaryTabOptimisticSlugServerSnapshot(): string | null {
  return null;
}

/** pathname 매칭 slug 와 optimistic 중 표시용 */
export function resolveBrowsePrimaryTabActiveSlug(
  pathnamePrimary: string | null,
  optimistic: string | null
): string | null {
  return optimistic ?? pathnamePrimary;
}
