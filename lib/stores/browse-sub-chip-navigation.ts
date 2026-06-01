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

/** 2차 칩 재탭 등 — 목록 강제 refetch (헤더 ↔ 본문 경량 신호) */
let listRefreshTick = 0;
const listRefreshListeners = new Set<() => void>();

export function bumpBrowseListRefresh(): void {
  listRefreshTick += 1;
  listRefreshListeners.forEach((l) => l());
}

export function subscribeBrowseListRefresh(listener: () => void): () => void {
  listRefreshListeners.add(listener);
  return () => listRefreshListeners.delete(listener);
}

export function getBrowseListRefreshSnapshot(): number {
  return listRefreshTick;
}

export function getBrowseListRefreshServerSnapshot(): number {
  return 0;
}
