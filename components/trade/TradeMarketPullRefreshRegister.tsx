"use client";

import { useLayoutEffect } from "react";
import { addTradeMarketPullRefreshHandler } from "@/lib/trade/trade-market-pull-refresh-store";

/** `/market`·`/market/[slug]` — 경로별 PTR 새로고침 핸들러 등록 */
export function TradeMarketPullRefreshRegister({
  routeKey,
  onRefresh,
}: {
  routeKey: string;
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    return addTradeMarketPullRefreshHandler(routeKey, onRefresh);
  }, [routeKey, onRefresh]);

  return null;
}
