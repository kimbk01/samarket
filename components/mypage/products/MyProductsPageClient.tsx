"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MyProductFilter } from "@/components/mypage/products/MyProductFilter";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import {
  buildMyProductsListingHref,
  parseMyProductListingFilterKey,
  parseMyProductPromotedOnly,
} from "@/lib/products/my-product-listing-filter";

function MyProductsPageInner() {
  const { t } = useI18n();
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
    <MyScreen
      title={t("marketplace_seller_products_title")}
      template="list"
      headerBelow={
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
    </MyScreen>
  );
}

export function MyProductsPageClient() {
  return (
    <Suspense fallback={null}>
      <MyProductsPageInner />
    </Suspense>
  );
}
