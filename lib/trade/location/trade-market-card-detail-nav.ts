"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { prepareTradeMarketListToDetailNavigation } from "@/lib/trade/location/trade-market-list-scroll-restore";
import {
  marketplaceBrowseStateIdentityKey,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";
import {
  armTradeMarketProductCompositionForward,
  measureListComposition,
} from "@/lib/trade/marketplace/trade-market-product-composition";
import { rememberTradeListPresentationSelection } from "@/lib/trade/marketplace/trade-list-presentation-session";

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

  const measured = measureListComposition(cardEl);
  const browseIdentity = (() => {
    if (typeof window === "undefined") return routeKey;
    try {
      const sp = new URLSearchParams(window.location.search);
      return marketplaceBrowseStateIdentityKey(parseMarketplaceBrowseStateFromSearchParams(sp));
    } catch {
      return routeKey;
    }
  })();
  rememberTradeListPresentationSelection({
    identity: browseIdentity,
    productId: postId,
    scrollY: getMainAppScrollTop(),
    geometry: {
      mediaRect: measured.mediaRect,
      priceRect: measured.priceRect,
      titleRect: measured.titleRect,
      metaRect: measured.metaRect,
      imageUrl: imageUrl ?? null,
      priceText: priceText ?? null,
      titleText: titleText ?? null,
      locationText: locationText ?? null,
    },
  });

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
