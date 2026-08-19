"use client";

import {
  getPostsForHome,
  peekCachedPostsForHome,
} from "@/lib/posts/getPostsForHome";
import {
  marketplaceBrowseStateToGetPostsForHomeOptions,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const MARKET_PREWARM_DEDUPE_MS = 800;
let lastMarketPrewarmAt = 0;

/** CUT-SSOT-6: prewarm uses same getPostsForHome + browse options as list display. */
export function prewarmBottomNavMarketTab(path: string): void {
  let url: URL;
  try {
    url = new URL(path, "http://localhost");
  } catch {
    return;
  }

  const pathOnly = url.pathname.trim().replace(/\/+$/, "") || "";
  if (pathOnly !== "/market" && !pathOnly.startsWith("/market/")) return;

  if (pathOnly.startsWith("/market/") && pathOnly !== "/market") {
    const m = pathOnly.match(/^\/market\/([^/]+)$/);
    if (!m) return;
    const legacyParent = decodeSegment(m[1]!);
    url.searchParams.set("category", legacyParent);
  }

  const browseState = parseMarketplaceBrowseStateFromSearchParams(url.searchParams);
  if (browseState.locationScope.mode === "unset") return;

  const fetchOpts = marketplaceBrowseStateToGetPostsForHomeOptions(browseState);

  if (!fetchOpts.locationAll && !fetchOpts.lguCityId) return;
  if (peekCachedPostsForHome(fetchOpts)?.posts?.length) return;

  const now = Date.now();
  if (now - lastMarketPrewarmAt < MARKET_PREWARM_DEDUPE_MS) return;
  lastMarketPrewarmAt = now;

  void getPostsForHome({ page: 1, ...fetchOpts }).catch(() => {
    /* mount single-flight merge */
  });
}
