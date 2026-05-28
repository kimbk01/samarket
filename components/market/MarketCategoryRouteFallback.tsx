"use client";

import { usePathname } from "next/navigation";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { MarketCategoryPageClient } from "@/components/market/MarketCategoryPageClient";

/**
 * `/market/[slug]` RSC 부트스트랩 대기 중에도 `/market` 루트와 같이 **클라 셸**을 즉시 올려
 * `market-bootstrap`·피드 캐시가 선행되게 한다. 전면 스켈레톤만 덮으면 주제·칩 전환 체감이 크게 느려진다.
 */
export function MarketCategoryRouteFallback() {
  const pathname = usePathname();
  const segment = (pathname.split("?")[0] ?? "").trim().match(/^\/market\/([^/]+)/)?.[1] ?? "";
  let slugOrId = segment;
  try {
    slugOrId = decodeURIComponent(segment);
  } catch {
    /* keep */
  }
  slugOrId = normalizeMarketSlugParam(slugOrId);
  if (!slugOrId.trim()) {
    return <div className="min-h-screen bg-sam-app" aria-hidden />;
  }

  return <MarketCategoryPageClient tradeServerSeed={null} slugOrId={slugOrId} />;
}
