/** 시뮬레이션 업종 탐색 URL (실매장 /stores/[slug] 와 분리 유지) */
export function storesBrowsePrimaryPath(primarySlug: string): string {
  return `/stores/browse/${encodeURIComponent(primarySlug)}`;
}

export function storesBrowsePath(primarySlug: string, subSlug: string): string {
  const q = new URLSearchParams();
  q.set("sub", subSlug);
  return `/stores/browse/${encodeURIComponent(primarySlug)}?${q.toString()}`;
}
