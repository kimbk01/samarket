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
} from "@/lib/stores/owner-lite-external-store";

/**
 * Global shell / Customer header entry — Owner navigation summary only.
 * Do not expose Owner order list or raw ownerStores arrays through this hook.
 */
export function useOwnerNavigationSummary(): OwnerNavigationSummary {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    () => {
      const snap = getOwnerLiteStoreSnapshot();
      return ownerNavigationSummaryFromPreferredStore({
        loading: snap.loading,
        store: snap.ownerStore,
      });
    },
    () => EMPTY_OWNER_NAVIGATION_SUMMARY
  );
}

export function useOwnerNavigationHasPreferredStore(): boolean {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    () => Boolean(getOwnerLiteStoreSnapshot().ownerStore?.id?.trim()),
    () => false
  );
}
