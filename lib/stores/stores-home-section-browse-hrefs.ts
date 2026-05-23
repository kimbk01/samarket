import { storesBrowsePathWithSort } from "@/components/stores/browse/stores-browse-paths";

const DEFAULT_PRIMARY = "restaurant";

/** 홈 `splitStoresHomeFeed` 섹션 ↔ browse 정렬 — 추측 금지, 아래 매핑만 사용 */
export const STORES_HOME_SECTION_BROWSE = {
  /** openNow: status open + deliveryAvailable → 배달빠른순 */
  orderNow: () => storesBrowsePathWithSort(DEFAULT_PRIMARY, { sub: "all", sort: "fast" }),
  /** discounted: browse 할인 전용 필터 없음 → 기본 목록 */
  discount: () => storesBrowsePathWithSort(DEFAULT_PRIMARY, { sub: "all", sort: "default" }),
  /** topRated: rating >= 4 → 평점순 */
  topRated: () => storesBrowsePathWithSort(DEFAULT_PRIMARY, { sub: "all", sort: "rating" }),
  /** nearby: distanceKm 정렬 → 가까운순 */
  nearby: () => storesBrowsePathWithSort(DEFAULT_PRIMARY, { sub: "all", sort: "distance" }),
  recommended: () => storesBrowsePathWithSort(DEFAULT_PRIMARY, { sub: "all", sort: "rating" }),
  allStores: () => storesBrowsePathWithSort(DEFAULT_PRIMARY, { sub: "all", sort: "default" }),
} as const;

export function parseStoreBrowseSortParam(raw: string | null | undefined): import("@/components/stores/browse/StoreListFilters").StoreBrowseSortId {
  const s = raw?.trim().toLowerCase();
  if (s === "distance" || s === "rating" || s === "reviews" || s === "fast") return s;
  return "default";
}
