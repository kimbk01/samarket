"use client";

import { preflightMainHubPtrRefresh } from "@/lib/layout/main-hub-ptr-preflight";
import {
  computeStoresHomePullPxFromTouchDy,
  resolveStoresHomePullHintHeightPx,
  resolveStoresHomePullRefreshSlotPx,
  STORES_HOME_PULL_REFRESH_COLLAPSE_MS,
  STORES_HOME_PULL_REFRESH_MAX_PX,
  STORES_HOME_PULL_REFRESH_MIN_SPIN_MS,
  STORES_HOME_PULL_REFRESH_SLOT_PX,
  STORES_HOME_PULL_REFRESH_THRESHOLD_PX,
} from "@/lib/stores/stores-home-pull-refresh-store";

export type MypagePullRefreshSnapshot = {
  pullPx: number;
  refreshing: boolean;
};

const EMPTY: MypagePullRefreshSnapshot = {
  pullPx: 0,
  refreshing: false,
};

let snapshot: MypagePullRefreshSnapshot = EMPTY;
const listeners = new Set<() => void>();
const refreshHandlers = new Set<() => void | Promise<void>>();

export const MYPAGE_PULL_REFRESH_THRESHOLD_PX = STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
export const MYPAGE_PULL_REFRESH_MAX_PX = STORES_HOME_PULL_REFRESH_MAX_PX;
export const MYPAGE_PULL_REFRESH_SLOT_PX = STORES_HOME_PULL_REFRESH_SLOT_PX;
export const MYPAGE_PULL_REFRESH_COLLAPSE_MS = STORES_HOME_PULL_REFRESH_COLLAPSE_MS;
export const MYPAGE_PULL_REFRESH_MIN_SPIN_MS = STORES_HOME_PULL_REFRESH_MIN_SPIN_MS;

export const computeMypagePullPxFromTouchDy = computeStoresHomePullPxFromTouchDy;
export const resolveMypagePullRefreshSlotPx = resolveStoresHomePullRefreshSlotPx;
export const resolveMypagePullHintHeightPx = resolveStoresHomePullHintHeightPx;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeMypagePullRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMypagePullRefreshSnapshot(): MypagePullRefreshSnapshot {
  return snapshot;
}

export function getMypagePullRefreshServerSnapshot(): MypagePullRefreshSnapshot {
  return EMPTY;
}

export function patchMypagePullRefresh(patch: Partial<MypagePullRefreshSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (next.pullPx === snapshot.pullPx && next.refreshing === snapshot.refreshing) return;
  snapshot = next;
  notify();
}

export function addMypagePullRefreshHandler(fn: () => void | Promise<void>): () => void {
  refreshHandlers.add(fn);
  return () => {
    refreshHandlers.delete(fn);
  };
}

/**
 * `/mypage` hub PTR — runs only registered handlers (useMypageHomeModel.refresh).
 * Do not invent fetch / window.location.reload.
 */
export async function runMypagePullRefresh(releasePullPx = 0): Promise<void> {
  if (refreshHandlers.size === 0 || snapshot.refreshing) return;
  preflightMainHubPtrRefresh();
  const slotPx = resolveMypagePullRefreshSlotPx(releasePullPx);
  patchMypagePullRefresh({ refreshing: true, pullPx: slotPx });
  const startedAt = performance.now();
  try {
    await Promise.all([...refreshHandlers].map((handler) => Promise.resolve(handler())));
  } finally {
    const waitMs = MYPAGE_PULL_REFRESH_MIN_SPIN_MS - (performance.now() - startedAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
    patchMypagePullRefresh({ refreshing: false, pullPx: slotPx });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    patchMypagePullRefresh({ refreshing: false, pullPx: 0 });
  }
}
