"use client";

import { useSyncExternalStore } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";
import {
  readOwnerActiveStoreIdFromSession,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";

function resolveApprovedOwnerStoreForFab(): StoreRow | null {
  const snap = getOwnerLiteStoreSnapshot();
  const approved = snap.ownerStores.filter((s) => String(s.approval_status) === "approved");
  if (approved.length === 0) return null;
  const routeSid =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("storeId")?.trim() || ""
      : "";
  return resolveOwnerActiveStoreRow(approved, {
    routeStoreId: routeSid,
    preferredStoreId: readOwnerActiveStoreIdFromSession() ?? snap.ownerStore?.id ?? null,
  });
}

/** FAB 매장 어드민 — OWNER ACTIVE STORE AUTHORITY (MODEL A) */
export function useApprovedOwnerStoreForFab(): StoreRow | null {
  return useSyncExternalStore(
    subscribeOwnerLiteStore,
    resolveApprovedOwnerStoreForFab,
    () => {
      const snap = getOwnerLiteStoreServerSnapshot();
      const approved = snap.ownerStores.filter((s) => String(s.approval_status) === "approved");
      return resolveOwnerActiveStoreRow(approved, {
        preferredStoreId: snap.ownerStore?.id ?? null,
      });
    }
  );
}
