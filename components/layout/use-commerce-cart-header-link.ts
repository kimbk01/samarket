"use client";

import { useMemo } from "react";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";

/** RegionBar·CommerceCartHeaderLink 공통 — 매장 장바구니 URL·개수 */
export function useCommerceCartHeaderLink() {
  const commerceCart = useStoreCommerceCartOptional();
  const cartCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;
  const cartHref = useMemo(() => {
    if (!commerceCart?.hydrated) return "/stores";
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart]);
  return { cartHref, cartCount };
}
