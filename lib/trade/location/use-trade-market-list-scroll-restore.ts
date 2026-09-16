"use client";

import { useEffect, useLayoutEffect } from "react";
import {
  clearTradeMarketSelectedListing,
  ensureTradeMarketListManualScrollRestoration,
  isTradeMarketListScrollRoute,
  noteTradeMarketListScrollPopstatePending,
  peekTradeMarketSelectedListing,
  tryRestoreTradeMarketListScroll,
} from "@/lib/trade/location/trade-market-list-scroll-restore";

import { shouldDeferTradeMarketListScrollRestore } from "@/lib/trade/marketplace/trade-market-product-composition";

let popstateListenerInstalled = false;

function ensureTradeMarketListScrollPopstateListener(): void {
  if (typeof window === "undefined" || popstateListenerInstalled) return;
  popstateListenerInstalled = true;
  ensureTradeMarketListManualScrollRestoration();
  window.addEventListener("popstate", () => {
    const path = window.location.pathname || "";
    const search = (window.location.search || "").replace(/^\?/, "");
    const routeKey = search ? `${path}?${search}` : path;
    if (isTradeMarketListScrollRoute(routeKey)) {
      noteTradeMarketListScrollPopstatePending(routeKey);
    }
  });
}

/**
 * Restore /market list scroll after detail back.
 * When product composition owns reverse presentation, defer restore until completion.
 */
export function useTradeMarketListScrollRestore(routeKey: string, ready: boolean): void {
  useEffect(() => {
    ensureTradeMarketListManualScrollRestoration();
    ensureTradeMarketListScrollPopstateListener();
  }, []);

  useLayoutEffect(() => {
    if (!ready || typeof window === "undefined") return;
    if (!isTradeMarketListScrollRoute(routeKey)) return;
    if (shouldDeferTradeMarketListScrollRestore(routeKey)) {
      const selectedId = peekTradeMarketSelectedListing(routeKey);
      if (selectedId) {
        window.setTimeout(() => {
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
        }, 400);
      }
      return;
    }
    tryRestoreTradeMarketListScroll(routeKey);
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
  }, [routeKey, ready]);
}
