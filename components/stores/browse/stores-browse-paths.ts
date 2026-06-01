/** browse 2차 칩·optimistic UI·perf 계측에 쓰는 「전체」 식별자 (`?sub` 없음과 동일) */
export const STORES_BROWSE_SUB_ALL = "all" as const;

/** 1차 업종 진입 URL — 목록 API와 캐시 키를 `sub=all`로 통일한다. */
export function storesBrowsePrimaryPath(primarySlug: string): string {
  return storesBrowseAllPath(primarySlug);
}

export function storesBrowsePath(primarySlug: string, subSlug: string): string {
  const q = new URLSearchParams();
  q.set("sub", subSlug);
  return `/stores/browse/${encodeURIComponent(primarySlug)}?${q.toString()}`;
}

/** 2차 「전체」 — `?sub=all` 고정 (진입·새로고침 canonical) */
export function storesBrowseAllPath(primarySlug: string): string {
  return storesBrowsePath(primarySlug.trim().toLowerCase(), STORES_BROWSE_SUB_ALL);
}

/** browse URL — `sort` 쿼리는 StoresBrowsePrimaryView 초기 정렬 */
export function storesBrowsePathWithSort(
  primarySlug: string,
  opts?: { sub?: string; sort?: import("@/components/stores/browse/StoreListFilters").StoreBrowseSortId }
): string {
  const slug = primarySlug.trim().toLowerCase() || "restaurant";
  const sub = (opts?.sub ?? "all").trim().toLowerCase() || "all";
  const q = new URLSearchParams();
  q.set("sub", sub);
  const sort = opts?.sort;
  if (sort && sort !== "default") q.set("sort", sort);
  return `/stores/browse/${encodeURIComponent(slug)}?${q.toString()}`;
}

/** 칩 클릭 시 optimistic/perf `sub` — href 와 반드시 같은 topic slug(또는 ALL) */
export function storesBrowseNavSubSlug(topicSlug: string): string {
  const s = topicSlug.trim();
  return s && s.toLowerCase() !== STORES_BROWSE_SUB_ALL ? s : STORES_BROWSE_SUB_ALL;
}
