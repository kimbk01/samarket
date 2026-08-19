"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MyProductFilter } from "@/components/mypage/products/MyProductFilter";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import { parseMyProductListingFilterKey } from "@/lib/products/my-product-listing-filter";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

function filterToQuery(filter: MyProductFilterKey): string {
  if (filter === "all") return "/mypage/products";
  return `/mypage/products?filter=${encodeURIComponent(filter)}`;
}

function MyProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<MyProductFilterKey>(() =>
    parseMyProductListingFilterKey(searchParams.get("filter"))
  );
  const [promotedOnly, setPromotedOnly] = useState(false);

  useEffect(() => {
    const raw = searchParams.get("filter");
    if (!raw) return;
    const next = parseMyProductListingFilterKey(raw);
    setFilter((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const handleFilterChange = useCallback(
    (next: MyProductFilterKey) => {
      setFilter(next);
      router.replace(filterToQuery(next), { scroll: false });
    },
    [router]
  );

  return (
    <MypageSubpageShell
      titleKey="marketplace_seller_products_title"
      subtitleKey="marketplace_seller_products_subtitle"
      backHref="/market/sell"
      section="trade"
      bodyClassName={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      stickyBelow={
        <MyProductFilter
          value={filter}
          onChange={handleFilterChange}
          promotedOnly={promotedOnly}
          onPromotedOnlyChange={setPromotedOnly}
        />
      }
    >
      <MyProductsView
        filter={filter}
        onFilterChange={handleFilterChange}
        promotedOnly={promotedOnly}
        onPromotedOnlyChange={setPromotedOnly}
      />
    </MypageSubpageShell>
  );
}

export function MyProductsPageClient() {
  return (
    <Suspense fallback={null}>
      <MyProductsPageInner />
    </Suspense>
  );
}
