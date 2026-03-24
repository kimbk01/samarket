/** `listCartBuckets()` 요약과 동일 필드 — context 순환 참조 방지 */
export type CommerceCartNavBucket = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  itemCount: number;
  subtotalPhp: number;
};

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
  if (sorted.length === 0) return "/stores";
  return `/stores/${encodeURIComponent(sorted[0].storeSlug)}/cart`;
}
