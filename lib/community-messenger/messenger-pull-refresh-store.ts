"use client";

import { preflightMainHubPtrRefresh } from "@/lib/layout/main-hub-ptr-preflight";
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

export type MessengerPullRefreshSnapshot = DibayPtrSnapshot;

export const MESSENGER_PULL_REFRESH_THRESHOLD_PX = DIBAY_PTR_THRESHOLD_PX;
export const MESSENGER_PULL_REFRESH_MAX_PX = DIBAY_PTR_MAX_PX;
export const MESSENGER_PULL_REFRESH_SLOT_PX = DIBAY_PTR_SLOT_PX;
export const MESSENGER_PULL_REFRESH_COLLAPSE_MS = DIBAY_PTR_COLLAPSE_MS;
export const MESSENGER_PULL_REFRESH_MIN_SPIN_MS = DIBAY_PTR_MIN_SPIN_MS;

export const computeMessengerPullPxFromTouchDy = computeDibayPtrPullPxFromTouchDy;
export const resolveMessengerPullRefreshSlotPx = resolveDibayPtrSlotPx;
export const resolveMessengerPullHintHeightPx = resolveDibayPtrHintHeightPx;

/** `/community-messenger` 홈 PTR */
export const messengerPtrStore = createDibayPtrStore({ preflight: preflightMainHubPtrRefresh });

export const subscribeMessengerPullRefresh = messengerPtrStore.subscribe;
export const getMessengerPullRefreshSnapshot = messengerPtrStore.getSnapshot;
export const getMessengerPullRefreshServerSnapshot = messengerPtrStore.getServerSnapshot;
export const patchMessengerPullRefresh = messengerPtrStore.patch;

export function addMessengerPullRefreshHandler(fn: DibayPtrHandler): () => void {
  return messengerPtrStore.addHandler(fn);
}

export function runMessengerPullRefresh(releasePullPx = 0): Promise<DibayPtrRunResult> {
  return messengerPtrStore.run(releasePullPx);
}
