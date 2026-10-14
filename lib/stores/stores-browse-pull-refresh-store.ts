"use client";

import { preflightStoresDeliveryPtrRefresh } from "@/lib/stores/stores-delivery-ptr-coordinator";
import { createDibayPtrStore, type DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import {
  computeDibayPtrPullPxFromTouchDy,
  DIBAY_PTR_COLLAPSE_MS,
  DIBAY_PTR_MAX_PX,
  DIBAY_PTR_MIN_SPIN_MS,
  DIBAY_PTR_SLOT_PX,
  DIBAY_PTR_THRESHOLD_PX,
  resolveDibayPtrHintHeightPx,
  resolveDibayPtrSlotPx,
  type DibayPtrHandler,
  type DibayPtrRunResult,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

export type StoresBrowsePullRefreshSnapshot = DibayPtrSnapshot;

export const STORES_BROWSE_PULL_REFRESH_THRESHOLD_PX = DIBAY_PTR_THRESHOLD_PX;
export const STORES_BROWSE_PULL_REFRESH_MAX_PX = DIBAY_PTR_MAX_PX;
export const STORES_BROWSE_PULL_REFRESH_SLOT_PX = DIBAY_PTR_SLOT_PX;
export const STORES_BROWSE_PULL_REFRESH_COLLAPSE_MS = DIBAY_PTR_COLLAPSE_MS;
export const STORES_BROWSE_PULL_REFRESH_MIN_SPIN_MS = DIBAY_PTR_MIN_SPIN_MS;

export const computeStoresBrowsePullPxFromTouchDy = computeDibayPtrPullPxFromTouchDy;
export const resolveStoresBrowsePullRefreshSlotPx = resolveDibayPtrSlotPx;
export const resolveStoresBrowsePullHintHeightPx = resolveDibayPtrHintHeightPx;

/** `/stores/browse/*` PTR */
export const storesBrowsePtrStore = createDibayPtrStore({ preflight: preflightStoresDeliveryPtrRefresh });

export const subscribeStoresBrowsePullRefresh = storesBrowsePtrStore.subscribe;
export const getStoresBrowsePullRefreshSnapshot = storesBrowsePtrStore.getSnapshot;
export const getStoresBrowsePullRefreshServerSnapshot = storesBrowsePtrStore.getServerSnapshot;
export const patchStoresBrowsePullRefresh = storesBrowsePtrStore.patch;

export function addStoresBrowsePullRefreshHandler(fn: DibayPtrHandler): () => void {
  return storesBrowsePtrStore.addHandler(fn);
}

export function runStoresBrowsePullRefresh(releasePullPx = 0): Promise<DibayPtrRunResult> {
  return storesBrowsePtrStore.run(releasePullPx);
}
