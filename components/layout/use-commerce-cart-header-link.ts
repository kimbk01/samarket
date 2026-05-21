"use client";

import { COMMERCE_CART_NAV_FALLBACK_GLOBAL } from "@/lib/stores/store-commerce-cart-nav";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";

/** RegionBar·CommerceCartHeaderLink 공통 — 매장 장바구니 URL·개수 */
export function useCommerceCartHeaderLink() {
  const { href: cartHref, cartCount } = useCommerceCartNavHref(COMMERCE_CART_NAV_FALLBACK_GLOBAL);
  return { cartHref, cartCount };
}
