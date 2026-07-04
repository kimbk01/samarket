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

export type MessengerPullRefreshSnapshot = {
  pullPx: number;
  refreshing: boolean;
};

const EMPTY: MessengerPullRefreshSnapshot = {
  pullPx: 0,
  refreshing: false,
};

let snapshot: MessengerPullRefreshSnapshot = EMPTY;
const listeners = new Set<() => void>();
const refreshHandlers = new Set<() => void | Promise<void>>();

export const MESSENGER_PULL_REFRESH_THRESHOLD_PX = STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
export const MESSENGER_PULL_REFRESH_MAX_PX = STORES_HOME_PULL_REFRESH_MAX_PX;
export const MESSENGER_PULL_REFRESH_SLOT_PX = STORES_HOME_PULL_REFRESH_SLOT_PX;
export const MESSENGER_PULL_REFRESH_COLLAPSE_MS = STORES_HOME_PULL_REFRESH_COLLAPSE_MS;
export const MESSENGER_PULL_REFRESH_MIN_SPIN_MS = STORES_HOME_PULL_REFRESH_MIN_SPIN_MS;

export const computeMessengerPullPxFromTouchDy = computeStoresHomePullPxFromTouchDy;
export const resolveMessengerPullRefreshSlotPx = resolveStoresHomePullRefreshSlotPx;
export const resolveMessengerPullHintHeightPx = resolveStoresHomePullHintHeightPx;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeMessengerPullRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMessengerPullRefreshSnapshot(): MessengerPullRefreshSnapshot {
  return snapshot;
}

export function getMessengerPullRefreshServerSnapshot(): MessengerPullRefreshSnapshot {
  return EMPTY;
}

export function patchMessengerPullRefresh(patch: Partial<MessengerPullRefreshSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (next.pullPx === snapshot.pullPx && next.refreshing === snapshot.refreshing) return;
  snapshot = next;
  notify();
}

export function addMessengerPullRefreshHandler(fn: () => void | Promise<void>): () => void {
  refreshHandlers.add(fn);
  return () => {
    refreshHandlers.delete(fn);
  };
}

export async function runMessengerPullRefresh(releasePullPx = 0): Promise<void> {
  if (refreshHandlers.size === 0 || snapshot.refreshing) return;
  preflightMainHubPtrRefresh();
  const slotPx = resolveMessengerPullRefreshSlotPx(releasePullPx);
  patchMessengerPullRefresh({ refreshing: true, pullPx: slotPx });
  const startedAt = performance.now();
  try {
    await Promise.all([...refreshHandlers].map((handler) => Promise.resolve(handler())));
  } finally {
    const waitMs = MESSENGER_PULL_REFRESH_MIN_SPIN_MS - (performance.now() - startedAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
    patchMessengerPullRefresh({ refreshing: false, pullPx: slotPx });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    patchMessengerPullRefresh({ refreshing: false, pullPx: 0 });
  }
}
