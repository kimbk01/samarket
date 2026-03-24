"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";

/**
 * 매장 탭 루트 1단 — 공통 `TradePrimaryColumnStickyAppBar`.
 * 뒤로: `runHistoryBackWithFallback`, 폴백 `/home`.
 */
export function StoresRootStickyBar() {
  const commerceCart = useStoreCommerceCartOptional();
  const cartLineKindCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;
  const cartHref = useMemo(() => {
    if (!commerceCart?.hydrated) return "/stores";
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart]);

  return (
    <TradePrimaryColumnStickyAppBar
      title="입점 매장"
      backButtonProps={{
        preferHistoryBack: true,
        backHref: "/home",
        ariaLabel: "이전 화면",
      }}
      actions={
        <Link
          href={cartHref}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-white/80"
          aria-label={cartLineKindCount > 0 ? "장바구니" : "매장"}
        >
          <StoreCommerceCartStrokeIcon className="h-5 w-5" />
          {cartLineKindCount > 0 ? (
            <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </Link>
      }
    />
  );
}
