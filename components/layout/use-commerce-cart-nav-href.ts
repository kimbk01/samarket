"use client";

import { useEffect, useMemo, useState } from "react";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import {
  COMMERCE_CART_NAV_FALLBACK_GLOBAL,
  resolveCommerceCartNavHref,
} from "@/lib/stores/store-commerce-cart-nav";

/**
 * 매장 장바구니 이동 href — SSR·첫 클라이언트 페인트는 `fallback` 고정,
 * 마운트·`StoreCommerceCart` hydrate 이후에만 버킷 기반 URL 로 갱신.
 */
export function useCommerceCartNavHref(fallback: string = COMMERCE_CART_NAV_FALLBACK_GLOBAL) {
  const commerceCart = useStoreCommerceCartOptional();
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    setNavReady(true);
  }, []);

  const href = useMemo(
    () =>
      resolveCommerceCartNavHref({
        navReady,
        cartHydrated: commerceCart?.hydrated ?? false,
        buckets: commerceCart?.listCartBuckets() ?? [],
        fallback,
      }),
    [navReady, commerceCart, fallback]
  );

  const cartCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;

  return { href, cartCount };
}
