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
import { resolveTradeMarketPullRefreshRouteKey } from "@/lib/trade/trade-market-pull-refresh-surface";

export type TradeMarketPullRefreshSnapshot = {
  pullPx: number;
  refreshing: boolean;
};

const EMPTY: TradeMarketPullRefreshSnapshot = {
  pullPx: 0,
  refreshing: false,
};

let snapshot: TradeMarketPullRefreshSnapshot = EMPTY;
const listeners = new Set<() => void>();
const refreshHandlers = new Map<string, () => void | Promise<void>>();

export const TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX = STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
export const TRADE_MARKET_PULL_REFRESH_MAX_PX = STORES_HOME_PULL_REFRESH_MAX_PX;
export const TRADE_MARKET_PULL_REFRESH_SLOT_PX = STORES_HOME_PULL_REFRESH_SLOT_PX;
export const TRADE_MARKET_PULL_REFRESH_COLLAPSE_MS = STORES_HOME_PULL_REFRESH_COLLAPSE_MS;
export const TRADE_MARKET_PULL_REFRESH_MIN_SPIN_MS = STORES_HOME_PULL_REFRESH_MIN_SPIN_MS;

export const computeTradeMarketPullPxFromTouchDy = computeStoresHomePullPxFromTouchDy;
export const resolveTradeMarketPullRefreshSlotPx = resolveStoresHomePullRefreshSlotPx;
export const resolveTradeMarketPullHintHeightPx = resolveStoresHomePullHintHeightPx;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeTradeMarketPullRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTradeMarketPullRefreshSnapshot(): TradeMarketPullRefreshSnapshot {
  return snapshot;
}

export function getTradeMarketPullRefreshServerSnapshot(): TradeMarketPullRefreshSnapshot {
  return EMPTY;
}

export function patchTradeMarketPullRefresh(patch: Partial<TradeMarketPullRefreshSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (next.pullPx === snapshot.pullPx && next.refreshing === snapshot.refreshing) return;
  snapshot = next;
  notify();
}

export function addTradeMarketPullRefreshHandler(
  routeKey: string,
  fn: () => void | Promise<void>
): () => void {
  refreshHandlers.set(routeKey, fn);
  return () => {
    if (refreshHandlers.get(routeKey) === fn) {
      refreshHandlers.delete(routeKey);
    }
  };
}

export async function runTradeMarketPullRefresh(
  releasePullPx: number,
  pathname: string | null | undefined
): Promise<void> {
  const routeKey = resolveTradeMarketPullRefreshRouteKey(pathname);
  const handler = routeKey ? refreshHandlers.get(routeKey) : undefined;
  if (!handler || snapshot.refreshing) return;
  preflightMainHubPtrRefresh();
  const slotPx = resolveTradeMarketPullRefreshSlotPx(releasePullPx);
  patchTradeMarketPullRefresh({ refreshing: true, pullPx: slotPx });
  const startedAt = performance.now();
  try {
    await Promise.resolve(handler());
  } finally {
    const waitMs = TRADE_MARKET_PULL_REFRESH_MIN_SPIN_MS - (performance.now() - startedAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
    patchTradeMarketPullRefresh({ refreshing: false, pullPx: slotPx });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    patchTradeMarketPullRefresh({ refreshing: false, pullPx: 0 });
  }
}
