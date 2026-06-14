"use client";

import { useLayoutEffect, useRef } from "react";
import { addTradeMarketPullRefreshHandler } from "@/lib/trade/trade-market-pull-refresh-store";

/** `/market`·`/market/[slug]`·주제 쿼리별 — PTR 새로고침 핸들러 등록 */
export function TradeMarketPullRefreshRegister({
  routeKey,
  onRefresh,
}: {
  routeKey: string;
  onRefresh: () => void | Promise<void>;
}) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useLayoutEffect(() => {
    return addTradeMarketPullRefreshHandler(routeKey, () => onRefreshRef.current());
  }, [routeKey]);

  return null;
}
