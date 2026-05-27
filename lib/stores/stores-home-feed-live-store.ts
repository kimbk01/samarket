"use client";

import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

/** 탭 이탈·리마운트 후에도 유지 — Map TTL 과 별도(세션 단일 스냅샷) */
export type StoresHomeFeedLiveEntry = {
  stores: StoreHomeFeedItem[];
  meta: { source?: string } | null;
  querySuffix: string;
  updatedAt: number;
};

let liveEntry: StoresHomeFeedLiveEntry | null = null;

export function readStoresHomeFeedLiveStore(): StoresHomeFeedLiveEntry | null {
  if (!liveEntry || liveEntry.stores.length === 0) return null;
  return liveEntry;
}

/**
 * CONTRACT — 재진입·fetch 실패 시 빈 배열로 live 스냅샷을 덮어쓰지 않는다.
 * DO NOT: `writeStoresHomeFeedLiveStore(suffix, [], …)` 로 목록 리셋.
 */
export function writeStoresHomeFeedLiveStore(
  querySuffix: string,
  stores: StoreHomeFeedItem[],
  meta: { source?: string } | null
): void {
  if (stores.length === 0) {
    if (liveEntry && liveEntry.stores.length > 0) return;
    liveEntry = { stores: [], meta, querySuffix, updatedAt: Date.now() };
    return;
  }
  liveEntry = { stores, meta, querySuffix, updatedAt: Date.now() };
}

/** 테스트/HMR */
export function resetStoresHomeFeedLiveStoreForTests(): void {
  liveEntry = null;
}
