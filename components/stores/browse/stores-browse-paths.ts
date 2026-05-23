/** browse 2차 칩·optimistic UI·perf 계측에 쓰는 「전체」 식별자 (`?sub` 없음과 동일) */
export const STORES_BROWSE_SUB_ALL = "all" as const;

/** 시뮬레이션 업종 탐색 URL (실매장 /stores/[slug] 와 분리 유지) */
export function storesBrowsePrimaryPath(primarySlug: string): string {
  return `/stores/browse/${encodeURIComponent(primarySlug)}`;
}

export function storesBrowsePath(primarySlug: string, subSlug: string): string {
  const q = new URLSearchParams();
  q.set("sub", subSlug);
  return `/stores/browse/${encodeURIComponent(primarySlug)}?${q.toString()}`;
}

/** 칩 클릭 시 optimistic/perf `sub` — href 와 반드시 같은 topic slug(또는 ALL) */
export function storesBrowseNavSubSlug(topicSlug: string): string {
  const s = topicSlug.trim();
  return s && s.toLowerCase() !== STORES_BROWSE_SUB_ALL ? s : STORES_BROWSE_SUB_ALL;
}
