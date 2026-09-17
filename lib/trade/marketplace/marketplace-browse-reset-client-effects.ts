"use client";

import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import {
  marketplaceBrowseStateIdentityKey,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";
import { clearTradeListPresentationSession } from "@/lib/trade/marketplace/trade-list-presentation-session";

/** Fired after CLASS A browse reset — cache bust + list row clear (CUT-SSOT-6). */
export const MARKETPLACE_BROWSE_RESET_EVENT = "samarket:marketplace-browse-reset";

export type MarketplaceBrowseResetEventDetail = {
  /** Browse identity invalidated by this CLASS A reset (matching session only). */
  identity: string;
};

/**
 * CLASS A reset side effects — 2-row Refresh, filter reset, master address change.
 * PTR (CLASS B) must NOT call this.
 *
 * CUT-SSOT-6: HomeProductList listener must clear posts/favoriteMap and force identity
 * replace — must not leave rendered rows from the previous browse identity.
 *
 * R-A: invalidate ONLY the matching TradeListPresentationSession for the browse
 * identity being reset. Never clear every identity (detail-child retain + isolation).
 */
export function applyMarketplaceBrowseResetClientEffects(): void {
  invalidateHomePostsCache({ notifyListReload: false });
  if (typeof window === "undefined") return;
  let identity = "";
  try {
    identity = marketplaceBrowseStateIdentityKey(
      parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(window.location.search))
    );
  } catch {
    identity = "";
  }
  if (identity) {
    clearTradeListPresentationSession(identity);
  }
  const detail: MarketplaceBrowseResetEventDetail = { identity };
  window.dispatchEvent(new CustomEvent(MARKETPLACE_BROWSE_RESET_EVENT, { detail }));
}
