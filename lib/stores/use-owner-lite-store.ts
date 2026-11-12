"use client";

import { useSyncExternalStore } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";

export type { OwnerLiteStoreState } from "@/lib/stores/owner-lite-external-store";
export { refreshOwnerLiteStore } from "@/lib/stores/owner-lite-external-store";

export function useOwnerLiteStore() {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    getOwnerLiteStoreSnapshot,
    getOwnerLiteStoreServerSnapshot
  );
}

/** `pickPreferredOwnerStore` 결과만 — 배지 탭·오너 뱃지 UI용 */
export function useOwnerLitePreferredStoreRow(): StoreRow | null {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    () => getOwnerLiteStoreSnapshot().ownerStore,
    () => null
  );
}

/**
 * 소유 매장(선호 1개) 존재 여부 — `loading` 플래그만 바뀌면 스냅샷 동일이라 리렌더 없음.
 * (전체 `useOwnerLiteStore`는 매 emit마다 새 객체로 네비 전체를 밀 수 있음)
 */
export function useOwnerLiteHasPreferredStore(): boolean {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    () => getOwnerLiteStoreSnapshot().ownerStore != null,
    () => false
  );
}
