"use client";

import { useSyncExternalStore } from "react";
import {
  EMPTY_OWNER_NAVIGATION_SUMMARY,
  ownerNavigationSummaryFromPreferredStore,
  type OwnerNavigationSummary,
} from "@/lib/delivery/owner/projections/owner-navigation-summary";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
  type OwnerLiteStoreState,
} from "@/lib/stores/owner-lite-external-store";
import { noopHubSubscribe, useHubActive } from "@/lib/layout/hub-active-context";

/**
 * Referentially-stable snapshot for `useSyncExternalStore`.
 *
 * CONTRACT: same (loading, ownerStore) input reference → same OwnerNavigationSummary reference.
 * A new object per getSnapshot() call makes useSyncExternalStore treat every read as a change,
 * which triggers an infinite re-render loop (React #185) and blocks initial app load via the
 * global BottomNav path. DO NOT return a freshly-created object here.
 */
let cachedInputLoading: boolean | undefined;
let cachedInputStore: OwnerLiteStoreState["ownerStore"] | undefined;
let cachedSummary: OwnerNavigationSummary = EMPTY_OWNER_NAVIGATION_SUMMARY;

export function getOwnerNavigationSummarySnapshot(): OwnerNavigationSummary {
  const snap = getOwnerLiteStoreSnapshot();

  if (snap.loading === cachedInputLoading && snap.ownerStore === cachedInputStore) {
    return cachedSummary;
  }

  cachedInputLoading = snap.loading;
  cachedInputStore = snap.ownerStore;
  cachedSummary = ownerNavigationSummaryFromPreferredStore({
    loading: snap.loading,
    store: snap.ownerStore,
  });

  return cachedSummary;
}

/**
 * Global shell / Customer header entry — Owner navigation summary only.
 * Do not expose Owner order list or raw ownerStores arrays through this hook.
 */
export function useOwnerNavigationSummary(): OwnerNavigationSummary {
  /** D1 S2: 숨긴 하단 탭 허브는 구독하지 않는다 — 첫 구독이 사장님 매장 받기를 시작하므로 */
  const hubActive = useHubActive();
  return useSyncExternalStore(
    hubActive ? subscribeOwnerLiteStore : noopHubSubscribe,
    getOwnerNavigationSummarySnapshot,
    () => EMPTY_OWNER_NAVIGATION_SUMMARY
  );
}

export function useOwnerNavigationHasPreferredStore(): boolean {
  /** D1 S2: 숨긴 하단 탭 허브는 구독하지 않는다 — 첫 구독이 사장님 매장 받기를 시작하므로 */
  const hubActive = useHubActive();
  return useSyncExternalStore(
    hubActive ? subscribeOwnerLiteStore : noopHubSubscribe,
    () => Boolean(getOwnerLiteStoreSnapshot().ownerStore?.id?.trim()),
    () => false
  );
}
