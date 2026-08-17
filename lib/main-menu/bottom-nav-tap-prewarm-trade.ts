"use client";

import {
  getPostsForHome,
  peekCachedPostsForHome,
} from "@/lib/posts/getPostsForHome";
import {
  getPostsByTradeCategoryIds,
  getTradeFeedClientViewerSegment,
} from "@/lib/posts/getPostsByCategory";
import { isCachedTradeFeedFresh } from "@/lib/posts/trade-feed-client-cache";
import { marketplaceHomePrewarmOptions, marketplaceFeedLocationExtras } from "@/lib/trade/marketplace/client-location-fetch";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const MARKET_PREWARM_DEDUPE_MS = 800;
let lastMarketPrewarmAt = 0;

export function prewarmBottomNavMarketTab(path: string): void {
  let url: URL;
  try {
    url = new URL(path, "http://localhost");
  } catch {
    return;
  }
  const pathOnly = url.pathname.trim().replace(/\/+$/, "") || "";
  const categoryQuery = (url.searchParams.get("category") ?? "").trim();

  if (pathOnly === "/market" && !categoryQuery) {
    const prewarm = marketplaceHomePrewarmOptions(url.searchParams);
    if (!prewarm) return;
    if (peekCachedPostsForHome(prewarm)?.posts?.length) return;
    const now = Date.now();
    if (now - lastMarketPrewarmAt < MARKET_PREWARM_DEDUPE_MS) return;
    lastMarketPrewarmAt = now;
    void getPostsForHome({ page: 1, ...prewarm }).catch(() => {
      /* 마운트 후 single-flight 합류 */
    });
    return;
  }

  let parent = categoryQuery;
  if (!parent) {
    const m = pathOnly.match(/^\/market\/([^/]+)$/);
    if (!m) return;
    parent = decodeSegment(m[1]!);
  } else {
    parent = decodeSegment(parent);
  }

  const locExtras = marketplaceFeedLocationExtras(
    parseTradeLocationScopeFromSearchParams(url.searchParams)
  );
  const opts = {
    page: 1,
    sort: "latest" as const,
    tradeMarketParent: parent,
    topic: "",
    ...locExtras,
  };
  if (!locExtras.lguCityId && !locExtras.locationAll) return;
  if (isCachedTradeFeedFresh([], opts, getTradeFeedClientViewerSegment())) return;
  void getPostsByTradeCategoryIds([], opts).catch(() => {
    /* 동일 */
  });
}
