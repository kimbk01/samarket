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
  if (path === "/market") {
    const opts = { sort: "latest" as const, type: null, tradeState: "latest" as const };
    if (peekCachedPostsForHome(opts)?.posts?.length) return;
    const now = Date.now();
    if (now - lastMarketPrewarmAt < MARKET_PREWARM_DEDUPE_MS) return;
    lastMarketPrewarmAt = now;
    void getPostsForHome({ page: 1, ...opts }).catch(() => {
      /* 마운트 후 single-flight 합류 */
    });
    return;
  }

  const m = path.match(/^\/market\/([^/]+)$/);
  if (!m) return;
  const parent = decodeSegment(m[1]!);
  const opts = {
    page: 1,
    sort: "latest" as const,
    tradeMarketParent: parent,
    topic: "",
  };
  if (isCachedTradeFeedFresh([], opts, getTradeFeedClientViewerSegment())) return;
  void getPostsByTradeCategoryIds([], opts).catch(() => {
    /* 동일 */
  });
}
