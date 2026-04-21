"use client";

import { Suspense } from "react";
import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { MarketCategoryFeed } from "@/components/market/MarketCategoryFeed";
import type { TradeCategoryServerSeed } from "@/lib/market/trade-category-server-seed";

export function MarketCategoryPageClient({
  layoutKey,
  tradeServerSeed,
  slugOrId,
}: {
  layoutKey: string;
  tradeServerSeed: TradeCategoryServerSeed | null;
  slugOrId: string;
}) {
  return (
    <CategoryListLayout
      key={layoutKey}
      slugOrId={slugOrId}
      expectedType="trade"
      backHref="/home"
      tradeServerSeed={tradeServerSeed}
    >
      {(category, extra) => (
        <Suspense
          fallback={<div className="py-8 text-center sam-text-body text-sam-muted">불러오는 중…</div>}
        >
          <MarketCategoryFeed
            category={category}
            initialChildren={extra?.tradeBootstrapChildren}
            initialChildrenForFilter={extra?.tradeBootstrapChildrenForFilter}
            bootstrapFeed={extra?.tradeBootstrapFeed}
          />
        </Suspense>
      )}
    </CategoryListLayout>
  );
}
