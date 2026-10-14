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

export type PhilifePullRefreshSnapshot = DibayPtrSnapshot;

export const PHILIFE_PULL_REFRESH_THRESHOLD_PX = DIBAY_PTR_THRESHOLD_PX;
export const PHILIFE_PULL_REFRESH_MAX_PX = DIBAY_PTR_MAX_PX;
export const PHILIFE_PULL_REFRESH_SLOT_PX = DIBAY_PTR_SLOT_PX;
export const PHILIFE_PULL_REFRESH_COLLAPSE_MS = DIBAY_PTR_COLLAPSE_MS;
export const PHILIFE_PULL_REFRESH_MIN_SPIN_MS = DIBAY_PTR_MIN_SPIN_MS;

export const computePhilifePullPxFromTouchDy = computeDibayPtrPullPxFromTouchDy;
export const resolvePhilifePullRefreshSlotPx = resolveDibayPtrSlotPx;
export const resolvePhilifePullHintHeightPx = resolveDibayPtrHintHeightPx;

/** `/philife` 커뮤니티 피드 PTR */
export const philifePtrStore = createDibayPtrStore({ preflight: preflightMainHubPtrRefresh });

export const subscribePhilifePullRefresh = philifePtrStore.subscribe;
export const getPhilifePullRefreshSnapshot = philifePtrStore.getSnapshot;
export const getPhilifePullRefreshServerSnapshot = philifePtrStore.getServerSnapshot;
export const patchPhilifePullRefresh = philifePtrStore.patch;

export function addPhilifePullRefreshHandler(fn: DibayPtrHandler): () => void {
  return philifePtrStore.addHandler(fn);
}

export function runPhilifePullRefresh(releasePullPx = 0): Promise<DibayPtrRunResult> {
  return philifePtrStore.run(releasePullPx);
}
