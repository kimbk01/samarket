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

export type PhilifePullRefreshSnapshot = {
  pullPx: number;
  refreshing: boolean;
};

const EMPTY: PhilifePullRefreshSnapshot = {
  pullPx: 0,
  refreshing: false,
};

let snapshot: PhilifePullRefreshSnapshot = EMPTY;
const listeners = new Set<() => void>();
const refreshHandlers = new Set<() => void | Promise<void>>();

export const PHILIFE_PULL_REFRESH_THRESHOLD_PX = STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
export const PHILIFE_PULL_REFRESH_MAX_PX = STORES_HOME_PULL_REFRESH_MAX_PX;
export const PHILIFE_PULL_REFRESH_SLOT_PX = STORES_HOME_PULL_REFRESH_SLOT_PX;
export const PHILIFE_PULL_REFRESH_COLLAPSE_MS = STORES_HOME_PULL_REFRESH_COLLAPSE_MS;
export const PHILIFE_PULL_REFRESH_MIN_SPIN_MS = STORES_HOME_PULL_REFRESH_MIN_SPIN_MS;

export const computePhilifePullPxFromTouchDy = computeStoresHomePullPxFromTouchDy;
export const resolvePhilifePullRefreshSlotPx = resolveStoresHomePullRefreshSlotPx;
export const resolvePhilifePullHintHeightPx = resolveStoresHomePullHintHeightPx;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribePhilifePullRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPhilifePullRefreshSnapshot(): PhilifePullRefreshSnapshot {
  return snapshot;
}

export function getPhilifePullRefreshServerSnapshot(): PhilifePullRefreshSnapshot {
  return EMPTY;
}

export function patchPhilifePullRefresh(patch: Partial<PhilifePullRefreshSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (next.pullPx === snapshot.pullPx && next.refreshing === snapshot.refreshing) return;
  snapshot = next;
  notify();
}

export function addPhilifePullRefreshHandler(fn: () => void | Promise<void>): () => void {
  refreshHandlers.add(fn);
  return () => {
    refreshHandlers.delete(fn);
  };
}

export async function runPhilifePullRefresh(releasePullPx = 0): Promise<void> {
  if (refreshHandlers.size === 0 || snapshot.refreshing) return;
  preflightMainHubPtrRefresh();
  const slotPx = resolvePhilifePullRefreshSlotPx(releasePullPx);
  patchPhilifePullRefresh({ refreshing: true, pullPx: slotPx });
  const startedAt = performance.now();
  try {
    await Promise.all([...refreshHandlers].map((handler) => Promise.resolve(handler())));
  } finally {
    const waitMs = PHILIFE_PULL_REFRESH_MIN_SPIN_MS - (performance.now() - startedAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
    patchPhilifePullRefresh({ refreshing: false, pullPx: slotPx });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    patchPhilifePullRefresh({ refreshing: false, pullPx: 0 });
  }
}
