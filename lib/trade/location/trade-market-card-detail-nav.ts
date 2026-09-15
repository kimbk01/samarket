"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { prepareTradeMarketListToDetailNavigation } from "@/lib/trade/location/trade-market-list-scroll-restore";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function clearTradeMarketCardDetailNavigationMarkers(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.marketListVt;
  document.querySelectorAll("[data-market-vt-active='1']").forEach((el) => {
    delete (el as HTMLElement).dataset.marketVtActive;
  });
}

/**
 * Save scroll + selected listing; optionally run a light View Transition into detail.
 * Returns true when the click was handled (caller should preventDefault).
 */
export function handleTradeMarketCardDetailClick(input: {
  event: { preventDefault: () => void };
  postId: string;
  detailHref: string;
  routeKey: string;
  cardEl: HTMLElement | null;
  router: AppRouterInstance;
}): boolean {
  const { event, postId, detailHref, routeKey, cardEl, router } = input;
  prepareTradeMarketListToDetailNavigation({ routeKey, postId });

  if (prefersReducedMotion()) return false;
  const doc = typeof document !== "undefined" ? document : null;
  const startVt =
    doc &&
    "startViewTransition" in doc &&
    typeof (doc as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } })
      .startViewTransition === "function"
      ? (
          doc as Document & {
            startViewTransition: (cb: () => void) => { finished: Promise<void> };
          }
        ).startViewTransition
      : null;

  if (!startVt) return false;

  event.preventDefault();
  if (cardEl) cardEl.dataset.marketVtActive = "1";
  doc!.documentElement.dataset.marketListVt = "forward";

  const transition = startVt(() => {
    router.push(detailHref);
  });
  void transition.finished.finally(() => {
    clearTradeMarketCardDetailNavigationMarkers();
  });
  return true;
}
