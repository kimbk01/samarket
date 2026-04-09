"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

const itemClass =
  "relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-ui-rect py-2 text-[#050505] active:bg-[#F0F2F5] dark:text-[#E4E6EB] dark:active:bg-[#3A3B3C]";

/** 상단 한 줄 — 배달앱 상단 유틸과 유사 (검색·장바구니·주문) */
export function StoreMemberQuickActions({ activeStoreOrderCount = 0 }: { activeStoreOrderCount?: number }) {
  const { ownerStores, loading: ownerLoading } = useOwnerLiteStore();
  const commerceCart = useStoreCommerceCartOptional();
  const cartLineKindCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;
  const cartHref = useMemo(() => {
    if (!commerceCart?.hydrated) return "/stores";
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart]);

  const myBusinessHref =
    !ownerLoading && ownerStores.length === 0 ? "/my/business/apply" : "/my/business";

  return (
    <div
      className={`grid grid-cols-4 divide-x divide-[#E4E6EB] overflow-hidden rounded-ui-rect border border-[#E4E6EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:divide-[#3E4042] dark:border-[#3E4042] dark:bg-[#242526] dark:shadow-none dark:ring-1 dark:ring-white/[0.06]`}
    >
      <Link href="/search" className={itemClass} aria-label="검색">
        <svg className="h-[22px] w-[22px] text-[#1877F2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className={`text-[10px] font-semibold ${FB.metaSm}`}>검색</span>
      </Link>
      <Link href={cartHref} className={itemClass} aria-label="장바구니">
        <span className="relative flex h-[22px] w-[22px] items-center justify-center">
          <StoreCommerceCartStrokeIcon className="h-[22px] w-[22px]" />
          {cartLineKindCount > 0 ? (
            <span className={`absolute -right-1.5 -top-1.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </span>
        <span className={`text-[10px] font-semibold ${FB.metaSm}`}>장바구니</span>
      </Link>
      <Link
        href="/my/store-orders"
        className={itemClass}
        aria-label={
          activeStoreOrderCount > 0
            ? `내 배달 주문 · 진행 중 ${activeStoreOrderCount}건`
            : "내 배달 주문"
        }
      >
        <span className="relative flex h-[22px] w-[22px] items-center justify-center">
          <svg className="h-[22px] w-[22px] text-[#1877F2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          {activeStoreOrderCount > 0 ? (
            <span className={`absolute -right-1.5 -top-1.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
              {activeStoreOrderCount > 99 ? "99+" : activeStoreOrderCount}
            </span>
          ) : null}
        </span>
        <span className={`text-[10px] font-semibold ${FB.metaSm}`}>내 주문</span>
      </Link>
      <Link href={myBusinessHref} className={itemClass} aria-label="내 매장 운영">
        <svg className="h-[22px] w-[22px] text-[#1877F2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <span className={`text-[10px] font-semibold ${FB.metaSm}`}>내 매장</span>
      </Link>
    </div>
  );
}
