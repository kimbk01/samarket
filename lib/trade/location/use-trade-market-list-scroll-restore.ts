"use client";

import { useLayoutEffect } from "react";
import {
  clearTradeMarketSelectedListing,
  isTradeMarketListScrollRoute,
  peekTradeMarketSelectedListing,
} from "@/lib/trade/location/trade-market-list-scroll-restore";
import { useHubActive } from "@/lib/layout/hub-active-context";

/**
 * /market 목록으로 돌아왔을 때 방금 본 카드를 잠깐 표시한다(`data-market-selected-return`).
 * 스크롤 위치 복원은 앱 공용 규칙(`lib/navigation/app-scroll-memory.ts`) — 여기서는 위치를 움직이지 않는다 (스크롤 SSOT 2026-11-03).
 */
export function useTradeMarketSelectedListingReturn(routeKey: string, ready: boolean): void {
  const hubActive = useHubActive();
  useLayoutEffect(() => {
    if (!hubActive) return;
    if (!ready || typeof window === "undefined") return;
    if (!isTradeMarketListScrollRoute(routeKey)) return;
    const selectedId = peekTradeMarketSelectedListing(routeKey);
    if (!selectedId) return;
    const el = document.querySelector(
      `[data-market-listing-id="${CSS.escape(selectedId)}"]`
    ) as HTMLElement | null;
    if (el) {
      el.dataset.marketSelectedReturn = "1";
      window.setTimeout(() => {
        delete el.dataset.marketSelectedReturn;
        clearTradeMarketSelectedListing();
      }, 420);
    } else {
      clearTradeMarketSelectedListing();
    }
  }, [hubActive, routeKey, ready]);
}
