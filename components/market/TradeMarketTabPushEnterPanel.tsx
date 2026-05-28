"use client";

import { useMemo } from "react";
import { HomeProductList } from "@/components/home/HomeProductList";
import { MarketCategoryPageClient } from "@/components/market/MarketCategoryPageClient";
import { parseMenuNavigationHref } from "@/contexts/LatestMenuNavigationContext";

function marketCategorySlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/market\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * 거래 1차 탭 push — 들어오는 패널 전용.
 * RSC 대기 중에도 `peek*`·CategoryListLayout 클라 셸로 **스켈레톤 전면 덮기 없이** 실목록을 그린다.
 */
export function TradeMarketTabPushEnterPanel({ href }: { href: string }) {
  const { pathname } = parseMenuNavigationHref(href);
  const slug = useMemo(() => marketCategorySlugFromPath(pathname), [pathname]);

  if (pathname === "/market") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app">
        <HomeProductList clientInstantBoot />
      </div>
    );
  }

  if (slug) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app">
        <MarketCategoryPageClient tradeServerSeed={null} slugOrId={slug} />
      </div>
    );
  }

  return <div className="min-h-screen bg-sam-app" aria-hidden />;
}
