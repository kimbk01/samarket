"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { prepareTradeMarketListToDetailNavigation } from "@/lib/trade/location/trade-market-list-scroll-restore";
import { armTradeMarketProductCompositionForward } from "@/lib/trade/marketplace/trade-market-product-composition";

/**
 * List→detail click prep (scroll DATA + product-composition arm).
 *
 * Navigation owner: native `<Link href=/post/:id>` + App Router.
 * Presentation owner: TradeMarketProductCompositionHost.
 * FORBIDDEN: preventDefault, View Transitions as nav owner, manual router.push.
 */
export function clearTradeMarketCardDetailNavigationMarkers(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.marketListVt;
  document.querySelectorAll("[data-market-vt-active='1']").forEach((el) => {
    delete (el as HTMLElement).dataset.marketVtActive;
  });
}

/**
 * Save scroll + selected listing + arm product composition.
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
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
}): boolean {
  const { postId, routeKey, cardEl, imageUrl, priceText, titleText, locationText } = input;
  prepareTradeMarketListToDetailNavigation({ routeKey, postId });
  armTradeMarketProductCompositionForward({
    listingId: postId,
    cardEl,
    imageUrl: imageUrl ?? null,
    priceText: priceText ?? null,
    titleText: titleText ?? null,
    locationText: locationText ?? null,
    listRouteKey: routeKey,
  });
  clearTradeMarketCardDetailNavigationMarkers();
  return false;
}
