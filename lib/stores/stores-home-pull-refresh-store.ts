"use client";

import { preflightStoresDeliveryPtrRefresh } from "@/lib/stores/stores-delivery-ptr-coordinator";
import { createDibayPtrStore, type DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import {
  computeDibayPtrPullPxFromTouchDy,
  DIBAY_PTR_COLLAPSE_MS,
  DIBAY_PTR_HINT_MIN_PX,
  DIBAY_PTR_MAX_PX,
  DIBAY_PTR_MIN_SPIN_MS,
  DIBAY_PTR_SLOT_PX,
  DIBAY_PTR_THRESHOLD_PX,
  resolveDibayPtrHintHeightPx,
  resolveDibayPtrSlotPx,
  type DibayPtrHandler,
  type DibayPtrRunResult,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

export type StoresHomePullRefreshSnapshot = DibayPtrSnapshot;

/** 물리값 SSOT: `lib/ui/ptr/dibay-ptr-ssot.ts` — 아래는 기존 이름 호환 */
export const STORES_HOME_PULL_REFRESH_THRESHOLD_PX = DIBAY_PTR_THRESHOLD_PX;
export const STORES_HOME_PULL_REFRESH_MAX_PX = DIBAY_PTR_MAX_PX;
export const STORES_HOME_PULL_REFRESH_SLOT_PX = DIBAY_PTR_SLOT_PX;
export const STORES_HOME_PULL_REFRESH_HINT_MIN_PX = DIBAY_PTR_HINT_MIN_PX;
export const STORES_HOME_PULL_REFRESH_MIN_SPIN_MS = DIBAY_PTR_MIN_SPIN_MS;
export const STORES_HOME_PULL_REFRESH_COLLAPSE_MS = DIBAY_PTR_COLLAPSE_MS;

export const computeStoresHomePullPxFromTouchDy = computeDibayPtrPullPxFromTouchDy;
export const resolveStoresHomePullRefreshSlotPx = resolveDibayPtrSlotPx;
export const resolveStoresHomePullHintHeightPx = resolveDibayPtrHintHeightPx;

/** `/stores` 홈 — 피드·퀵카테고리·주문요약 핸들러를 병렬 실행 */
export const storesHomePtrStore = createDibayPtrStore({
  preflight: preflightStoresDeliveryPtrRefresh,
});

export const subscribeStoresHomePullRefresh = storesHomePtrStore.subscribe;
export const getStoresHomePullRefreshSnapshot = storesHomePtrStore.getSnapshot;
export const getStoresHomePullRefreshServerSnapshot = storesHomePtrStore.getServerSnapshot;
export const patchStoresHomePullRefresh = storesHomePtrStore.patch;

/** @deprecated 단일 슬롯 — `addStoresHomePullRefreshHandler` 사용 */
export function registerStoresHomePullRefreshHandler(fn: DibayPtrHandler | null): void {
  storesHomePtrStore.replaceHandlers(fn);
}

export function addStoresHomePullRefreshHandler(fn: DibayPtrHandler): () => void {
  return storesHomePtrStore.addHandler(fn);
}

export function runStoresHomePullRefresh(releasePullPx = 0): Promise<DibayPtrRunResult> {
  return storesHomePtrStore.run(releasePullPx);
}
