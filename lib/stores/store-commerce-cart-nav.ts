/** `listCartBuckets()` 요약과 동일 필드 — context 순환 참조 방지 */
export type CommerceCartNavBucket = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  itemCount: number;
  subtotalPhp: number;
};

/** 비어 있을 때·헤더/탐색 카트 아이콘 — SSR·첫 클라 페인트 fallback */
export const COMMERCE_CART_NAV_FALLBACK_GLOBAL = "/stores";

/** 통합 장바구니 페이지 — 배달 하단 탭 `delivery-cart` 기본 href 와 동일 */
export const COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART = "/stores/cart";

/** 담긴 품목이 있는 버킷만, 우선순위: 소계 큰 매장 → 이름 → id (헤더 카트 링크 일관성) */
export function sortedNonemptyCommerceBuckets(
  buckets: CommerceCartNavBucket[]
): CommerceCartNavBucket[] {
  return [...buckets]
    .filter((b) => b.itemCount > 0)
    .sort((a, b) => {
      if (b.subtotalPhp !== a.subtotalPhp) return b.subtotalPhp - a.subtotalPhp;
      const n = a.storeName.localeCompare(b.storeName, "ko");
      if (n !== 0) return n;
      return a.storeId.localeCompare(b.storeId);
    });
}

/** 비어 있으면 매장 목록 */
export function commerceCartHrefFromBuckets(buckets: CommerceCartNavBucket[]): string {
  const sorted = sortedNonemptyCommerceBuckets(buckets);
  if (sorted.length === 0) return COMMERCE_CART_NAV_FALLBACK_GLOBAL;
  return `/stores/${encodeURIComponent(sorted[0].storeSlug)}/cart`;
}

/**
 * 장바구니 링크 href — `navReady` 가 false 인 동안 fallback 고정(SSR·hydration 일치).
 * localStorage 반영·`hydrated` 는 마운트 후에만 반영한다.
 */
export function resolveCommerceCartNavHref(input: {
  navReady: boolean;
  cartHydrated: boolean;
  buckets: CommerceCartNavBucket[];
  fallback: string;
}): string {
  const { navReady, cartHydrated, buckets, fallback } = input;
  if (!navReady || !cartHydrated) return fallback;
  return commerceCartHrefFromBuckets(buckets);
}
