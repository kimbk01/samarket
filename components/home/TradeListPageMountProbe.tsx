"use client";

import { useLayoutEffect } from "react";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";

export function TradeListPageMountProbe() {
  useLayoutEffect(() => {
    recordTradeListMetricOnce("trade_list_route_enter_ms", 0);
    recordTradeListMetricOnce("trade_list_page_mount_start_ms");
    recordTradeListMetricOnce("trade_list_page_mount_end_ms");
  }, []);

  return null;
}
