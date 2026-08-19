"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MyProductFilter } from "@/components/mypage/products/MyProductFilter";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import {
  buildMyProductsListingHref,
  parseMyProductListingFilterKey,
  parseMyProductPromotedOnly,
} from "@/lib/products/my-product-listing-filter";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

function MyProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<MyProductFilterKey>(() =>
    parseMyProductListingFilterKey(searchParams.get("filter"))
  );
  const [promotedOnly, setPromotedOnly] = useState(() =>
    parseMyProductPromotedOnly(searchParams.get("promoted"))
  );

  useEffect(() => {
    const nextFilter = parseMyProductListingFilterKey(searchParams.get("filter"));
    const nextPromoted = parseMyProductPromotedOnly(searchParams.get("promoted"));
    setFilter((prev) => (prev === nextFilter ? prev : nextFilter));
    setPromotedOnly((prev) => (prev === nextPromoted ? prev : nextPromoted));
  }, [searchParams]);

  const handleFilterChange = useCallback(
    (next: MyProductFilterKey) => {
      setFilter(next);
      router.replace(buildMyProductsListingHref(next, promotedOnly), { scroll: false });
    },
    [promotedOnly, router]
  );

  const handlePromotedOnlyChange = useCallback(
    (next: boolean) => {
      setPromotedOnly(next);
      router.replace(buildMyProductsListingHref(filter, next), { scroll: false });
    },
    [filter, router]
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
          onPromotedOnlyChange={handlePromotedOnlyChange}
        />
      }
    >
      <MyProductsView
        filter={filter}
        onFilterChange={handleFilterChange}
        promotedOnly={promotedOnly}
        onPromotedOnlyChange={handlePromotedOnlyChange}
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
