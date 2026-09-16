"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { prepareTradeMarketListToDetailNavigation } from "@/lib/trade/location/trade-market-list-scroll-restore";

/**
 * List→detail click prep only.
 *
 * Navigation owner: native `<Link href=/post/:id>` + canonical `AppRouteTransition`
 * (marketplaceDetailStackDepth → rtl-forward). Card-level document View Transitions API
 * plus preventDefault plus manual router push is forbidden — it aborted the detail RSC and
 * left the URL on `/market` (Production Android CDP diagnostic CURRENT_VT FAIL / VT_BYPASS PASS).
 */
export function clearTradeMarketCardDetailNavigationMarkers(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.marketListVt;
  document.querySelectorAll("[data-market-vt-active='1']").forEach((el) => {
    delete (el as HTMLElement).dataset.marketVtActive;
  });
}

/**
 * Save scroll + selected listing for back-restore.
 * Always returns false — caller must NOT preventDefault; `<Link>` owns navigation.
 */
export function handleTradeMarketCardDetailClick(input: {
  event: { preventDefault: () => void };
  postId: string;
  detailHref: string;
  routeKey: string;
  cardEl: HTMLElement | null;
  router: AppRouterInstance;
}): boolean {
  const { postId, routeKey } = input;
  prepareTradeMarketListToDetailNavigation({ routeKey, postId });
  clearTradeMarketCardDetailNavigationMarkers();
  return false;
}
