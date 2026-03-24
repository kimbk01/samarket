"use client";

import Link from "next/link";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useCommerceCartHeaderLink } from "@/components/layout/use-commerce-cart-header-link";

/** `RegionBar`와 동일 — 현재 세션 사용자의 매장 장바구니로 이동(비어 있으면 `/stores`) */
export function CommerceCartHeaderLink() {
  const { cartHref, cartCount } = useCommerceCartHeaderLink();

  return (
    <Link
      href={cartHref}
      className="relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
      aria-label={cartCount > 0 ? "장바구니" : "매장 목록"}
    >
      <StoreCommerceCartStrokeIcon className="h-5 w-5" />
      {cartCount > 0 ? (
        <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
          {cartCount > 99 ? "99+" : cartCount}
        </span>
      ) : null}
    </Link>
  );
}
