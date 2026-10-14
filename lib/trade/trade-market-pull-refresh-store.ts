"use client";

import { preflightMainHubPtrRefresh } from "@/lib/layout/main-hub-ptr-preflight";
import { resolveTradeMarketPullRefreshRouteKey } from "@/lib/trade/trade-market-pull-refresh-surface";
import { createDibayKeyedPtrStore, type DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
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

export type TradeMarketPullRefreshSnapshot = DibayPtrSnapshot;

export const TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX = DIBAY_PTR_THRESHOLD_PX;
export const TRADE_MARKET_PULL_REFRESH_MAX_PX = DIBAY_PTR_MAX_PX;
export const TRADE_MARKET_PULL_REFRESH_SLOT_PX = DIBAY_PTR_SLOT_PX;
export const TRADE_MARKET_PULL_REFRESH_COLLAPSE_MS = DIBAY_PTR_COLLAPSE_MS;
export const TRADE_MARKET_PULL_REFRESH_MIN_SPIN_MS = DIBAY_PTR_MIN_SPIN_MS;

export const computeTradeMarketPullPxFromTouchDy = computeDibayPtrPullPxFromTouchDy;
export const resolveTradeMarketPullRefreshSlotPx = resolveDibayPtrSlotPx;
export const resolveTradeMarketPullHintHeightPx = resolveDibayPtrHintHeightPx;

/** `/market`·카테고리·주제 — 라우트 키(경로+committed query)별 단일 핸들러 */
export const tradeMarketPtrStore = createDibayKeyedPtrStore({ preflight: preflightMainHubPtrRefresh });

export const subscribeTradeMarketPullRefresh = tradeMarketPtrStore.subscribe;
export const getTradeMarketPullRefreshSnapshot = tradeMarketPtrStore.getSnapshot;
export const getTradeMarketPullRefreshServerSnapshot = tradeMarketPtrStore.getServerSnapshot;
export const patchTradeMarketPullRefresh = tradeMarketPtrStore.patch;

export function addTradeMarketPullRefreshHandler(routeKey: string, fn: DibayPtrHandler): () => void {
  return tradeMarketPtrStore.addHandler(routeKey, fn);
}

export function runTradeMarketPullRefresh(
  releasePullPx: number,
  pathname: string | null | undefined,
  search?: string | URLSearchParams | null
): Promise<DibayPtrRunResult> {
  return tradeMarketPtrStore.run(
    releasePullPx,
    resolveTradeMarketPullRefreshRouteKey(pathname, search)
  );
}
