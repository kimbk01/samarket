import type { StoreBrowseSortId } from "@/components/stores/browse/StoreListFilters";
import { parseStoreBrowseSortParam } from "@/lib/stores/stores-home-section-browse-hrefs";

/** Browse 목록 정렬 reset 범위 — 업종·서브탭 전환 (마운트 직후 deep link sort 유지) */
export function browseListSortScopeKey(primarySlug: string, activeSub: string): string {
  return `${primarySlug}|${activeSub}`;
}

/** scope가 실제로 바뀐 경우만 default 정렬로 복귀 (동일 scope = 마운트·리렌더) */
export function shouldResetBrowseListSortOnScopeChange(prevKey: string, nextKey: string): boolean {
  return prevKey !== nextKey;
}

/**
 * browse fetch/query authority — URL `sort`는 navigation pin 동안 우선.
 * chip 클릭으로 pin 해제 후에는 `listSort` state가 fetch authority.
 */
export function parseExplicitBrowseSortParam(
  raw: string | null | undefined
): StoreBrowseSortId | null {
  if (raw == null || String(raw).trim() === "") return null;
  const parsed = parseStoreBrowseSortParam(raw);
  const s = raw.trim().toLowerCase();
  if (s === "default" || s === "distance" || s === "rating" || s === "reviews" || s === "fast" || s === "popular") {
    return parsed;
  }
  return null;
}

export function resolveBrowseFetchSort(
  urlSortRaw: string | null | undefined,
  listSort: StoreBrowseSortId,
  urlSortPinned: boolean
): StoreBrowseSortId {
  if (!urlSortPinned) return listSort;
  const explicit = parseExplicitBrowseSortParam(urlSortRaw);
  if (explicit) return explicit;
  return listSort;
}
