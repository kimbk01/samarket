"use client";

/**
 * browse 헤더 2차 칩 ↔ `StoresBrowsePrimaryView` optimistic `sub` 동기화.
 * (헤더는 RegionBar, 본문은 페이지 — 단일 스토어로 탭 하이라이트·목록 쿼리 일치)
 */
let optimisticSub: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

export function setBrowseSubChipOptimisticSub(sub: string | null): void {
  optimisticSub = sub;
  bump();
}

export function getBrowseSubChipOptimisticSub(): string | null {
  return optimisticSub;
}

export function subscribeBrowseSubChipOptimisticSub(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowseSubChipOptimisticSubSnapshot(): string | null {
  return optimisticSub;
}

export function getBrowseSubChipOptimisticSubServerSnapshot(): string | null {
  return null;
}
