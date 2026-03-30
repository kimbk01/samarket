"use client";

import { useSyncExternalStore } from "react";
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
