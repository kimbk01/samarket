"use client";

import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { MarketCategoryFeed } from "@/components/market/MarketCategoryFeed";
import type { TradeCategoryServerSeed } from "@/lib/market/trade-category-server-seed";

export function MarketCategoryPageClient({
  tradeServerSeed,
  slugOrId,
}: {
  tradeServerSeed: TradeCategoryServerSeed | null;
  slugOrId: string;
}) {
  return (
    <CategoryListLayout
      key={slugOrId}
      slugOrId={slugOrId}
      expectedType="trade"
      backHref="/market"
      tradeServerSeed={tradeServerSeed}
    >
      {(category, extra) => (
        <MarketCategoryFeed
          category={category}
          initialChildren={extra?.tradeBootstrapChildren}
          initialChildrenForFilter={extra?.tradeBootstrapChildrenForFilter}
          bootstrapFeed={extra?.tradeBootstrapFeed}
        />
      )}
    </CategoryListLayout>
  );
}
