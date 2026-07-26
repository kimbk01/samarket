"use client";

import { useSyncExternalStore } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickApprovedOwnerStoreForFab } from "@/lib/main-menu/main-bottom-nav-fab-store-admin";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";
import { pickPreferredOwnerStore } from "@/lib/stores/pick-preferred-owner-store";

function resolveApprovedOwnerStoreForFab(): StoreRow | null {
  const snap = getOwnerLiteStoreSnapshot();
  const fromList = pickApprovedOwnerStoreForFab(snap.ownerStores);
  if (fromList) return fromList;
  const preferred = snap.ownerStore;
  if (preferred && String(preferred.approval_status) === "approved") return preferred;
  return pickPreferredOwnerStore(snap.ownerStores.filter((s) => String(s.approval_status) === "approved"));
}

/** FAB 매장 어드민 — `approval_status === approved` 소유 매장 1개 */
export function useApprovedOwnerStoreForFab(): StoreRow | null {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    resolveApprovedOwnerStoreForFab,
    () => pickApprovedOwnerStoreForFab(getOwnerLiteStoreServerSnapshot().ownerStores)
  );
}
