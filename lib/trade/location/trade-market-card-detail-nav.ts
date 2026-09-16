"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { prepareTradeMarketListToDetailNavigation } from "@/lib/trade/location/trade-market-list-scroll-restore";
import { captureTradeMarketCardOriginExpand } from "@/lib/trade/marketplace/trade-market-card-origin-expand";

/**
 * List→detail click prep only (scroll restore + card-origin geometry).
 *
 * Navigation owner: native `<Link href=/post/:id>` + App Router.
 * Visual owner: card-origin expand continuity (separate from navigation).
 * FORBIDDEN: preventDefault, document View Transitions as nav owner, manual router.push.
 */
export function clearTradeMarketCardDetailNavigationMarkers(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.marketListVt;
  document.querySelectorAll("[data-market-vt-active='1']").forEach((el) => {
    delete (el as HTMLElement).dataset.marketVtActive;
  });
}

/**
 * Save scroll + selected listing + optional card geometry for expand continuity.
 * Always returns false — caller must NOT preventDefault; `<Link>` owns navigation.
 */
export function handleTradeMarketCardDetailClick(input: {
  event: { preventDefault: () => void };
  postId: string;
  detailHref: string;
  routeKey: string;
  cardEl: HTMLElement | null;
  router: AppRouterInstance;
  imageUrl?: string | null;
}): boolean {
  const { postId, routeKey, cardEl, imageUrl } = input;
  prepareTradeMarketListToDetailNavigation({ routeKey, postId });
  captureTradeMarketCardOriginExpand({
    listingId: postId,
    cardEl,
    imageUrl: imageUrl ?? null,
  });
  clearTradeMarketCardDetailNavigationMarkers();
  return false;
}
