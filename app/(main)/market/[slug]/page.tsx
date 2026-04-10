"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { MarketCategoryFeed } from "@/components/market/MarketCategoryFeed";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";

function MarketCategoryPageInner() {
  const params = useParams();
  const slugOrId = normalizeMarketSlugParam(params?.slug);

  return (
    <CategoryListLayout slugOrId={slugOrId} expectedType="trade" backHref="/home">
      {(category, extra) => (
        <Suspense
          fallback={<div className="py-8 text-center text-[14px] text-gray-500">불러오는 중…</div>}
        >
          <MarketCategoryFeed
            category={category}
            initialChildren={extra?.tradeBootstrapChildren}
            bootstrapFeed={extra?.tradeBootstrapFeed}
          />
        </Suspense>
      )}
    </CategoryListLayout>
  );
}

export default function MarketCategoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[200px] flex items-center justify-center text-[14px] text-gray-500">
          불러오는 중…
        </div>
      }
    >
      <MarketCategoryPageInner />
    </Suspense>
  );
}
