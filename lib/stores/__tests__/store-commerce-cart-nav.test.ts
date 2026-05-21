import { describe, expect, it } from "vitest";
import {
  commerceCartHrefFromBuckets,
  resolveCommerceCartNavHref,
  COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART,
} from "@/lib/stores/store-commerce-cart-nav";

describe("resolveCommerceCartNavHref", () => {
  const buckets = [
    {
      storeId: "s1",
      storeSlug: "cafe-a",
      storeName: "Cafe",
      itemCount: 2,
      subtotalPhp: 100,
    },
  ];

  it("keeps fallback until nav is ready and cart is hydrated", () => {
    expect(
      resolveCommerceCartNavHref({
        navReady: false,
        cartHydrated: true,
        buckets,
        fallback: COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART,
      })
    ).toBe(COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART);

    expect(
      resolveCommerceCartNavHref({
        navReady: true,
        cartHydrated: false,
        buckets,
        fallback: COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART,
      })
    ).toBe(COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART);
  });

  it("resolves store cart when ready and hydrated", () => {
    expect(
      resolveCommerceCartNavHref({
        navReady: true,
        cartHydrated: true,
        buckets,
        fallback: COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART,
      })
    ).toBe("/stores/cafe-a/cart");
  });

  it("empty buckets use global list fallback", () => {
    expect(
      resolveCommerceCartNavHref({
        navReady: true,
        cartHydrated: true,
        buckets: [],
        fallback: COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART,
      })
    ).toBe(commerceCartHrefFromBuckets([]));
  });
});
