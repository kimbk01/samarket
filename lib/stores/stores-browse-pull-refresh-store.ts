"use client";

import { preflightStoresDeliveryPtrRefresh } from "@/lib/stores/stores-delivery-ptr-coordinator";
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

export type StoresBrowsePullRefreshSnapshot = {
  pullPx: number;
  refreshing: boolean;
};

const EMPTY: StoresBrowsePullRefreshSnapshot = {
  pullPx: 0,
  refreshing: false,
};

let snapshot: StoresBrowsePullRefreshSnapshot = EMPTY;
const listeners = new Set<() => void>();
const refreshHandlers = new Set<() => void | Promise<void>>();

/** `/stores` 홈 PTR 와 동일 스케일·임계값 */
export const STORES_BROWSE_PULL_REFRESH_THRESHOLD_PX = STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
export const STORES_BROWSE_PULL_REFRESH_MAX_PX = STORES_HOME_PULL_REFRESH_MAX_PX;
export const STORES_BROWSE_PULL_REFRESH_SLOT_PX = STORES_HOME_PULL_REFRESH_SLOT_PX;
export const STORES_BROWSE_PULL_REFRESH_COLLAPSE_MS = STORES_HOME_PULL_REFRESH_COLLAPSE_MS;
export const STORES_BROWSE_PULL_REFRESH_MIN_SPIN_MS = STORES_HOME_PULL_REFRESH_MIN_SPIN_MS;

export const computeStoresBrowsePullPxFromTouchDy = computeStoresHomePullPxFromTouchDy;
export const resolveStoresBrowsePullRefreshSlotPx = resolveStoresHomePullRefreshSlotPx;
export const resolveStoresBrowsePullHintHeightPx = resolveStoresHomePullHintHeightPx;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeStoresBrowsePullRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoresBrowsePullRefreshSnapshot(): StoresBrowsePullRefreshSnapshot {
  return snapshot;
}

export function getStoresBrowsePullRefreshServerSnapshot(): StoresBrowsePullRefreshSnapshot {
  return EMPTY;
}

export function patchStoresBrowsePullRefresh(patch: Partial<StoresBrowsePullRefreshSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (next.pullPx === snapshot.pullPx && next.refreshing === snapshot.refreshing) return;
  snapshot = next;
  notify();
}

export function addStoresBrowsePullRefreshHandler(fn: () => void | Promise<void>): () => void {
  refreshHandlers.add(fn);
  return () => {
    refreshHandlers.delete(fn);
  };
}

export async function runStoresBrowsePullRefresh(releasePullPx = 0): Promise<void> {
  if (refreshHandlers.size === 0 || snapshot.refreshing) return;
  preflightStoresDeliveryPtrRefresh();
  const slotPx = resolveStoresBrowsePullRefreshSlotPx(releasePullPx);
  patchStoresBrowsePullRefresh({ refreshing: true, pullPx: slotPx });
  const startedAt = performance.now();
  try {
    await Promise.all([...refreshHandlers].map((handler) => Promise.resolve(handler())));
  } finally {
    const waitMs = STORES_BROWSE_PULL_REFRESH_MIN_SPIN_MS - (performance.now() - startedAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
    patchStoresBrowsePullRefresh({ refreshing: false, pullPx: slotPx });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    patchStoresBrowsePullRefresh({ refreshing: false, pullPx: 0 });
  }
}
