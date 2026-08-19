"use client";

import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";

/** Fired after CLASS A browse reset — bump list pagination epoch + server page. */
export const MARKETPLACE_BROWSE_RESET_EVENT = "samarket:marketplace-browse-reset";

/**
 * CLASS A reset side effects — 2-row Refresh, filter reset, master address change.
 * PTR (CLASS B) must NOT call this.
 */
export function applyMarketplaceBrowseResetClientEffects(): void {
  invalidateHomePostsCache({ notifyListReload: false });
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MARKETPLACE_BROWSE_RESET_EVENT));
}
