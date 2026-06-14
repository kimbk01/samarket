"use client";

import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { useTradeMarketPullRefresh } from "@/lib/trade/use-trade-market-pull-refresh";

/** 거래 허브 PTR touch 리스너 — `AppStickyHeader` 에서 마운트 */
export function TradeMarketPullRefreshHost() {
  const ptrDomain = useMainHubPtrDomain();
  useTradeMarketPullRefresh(ptrDomain === "trade");
  return null;
}
