/**
 * DSC-08 — 배달 검색 키워드 ↔ URL `?q=` (뒤로가기·매장 진입 origin 복원).
 */

export const DELIVERY_SEARCH_KEYWORD_PARAM = "q";

export function normalizeDeliverySearchKeyword(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 60);
}

/** `useSearchParams()` → 초기 검색어 */
export function readDeliverySearchKeywordFromParams(
  params: { get(name: string): string | null } | null | undefined
): string {
  return normalizeDeliverySearchKeyword(params?.get(DELIVERY_SEARCH_KEYWORD_PARAM) ?? "");
}

/**
 * 확정 검색어를 반영한 `pathname?search#hash` — 이미 같으면 null (replaceState 생략).
 * 빈 검색어는 `q` 제거, 다른 쿼리 파라미터는 유지.
 */
export function buildDeliverySearchHrefWithKeyword(currentHref: string, keyword: string): string | null {
  const url = new URL(currentHref);
  const k = normalizeDeliverySearchKeyword(keyword);
  if ((url.searchParams.get(DELIVERY_SEARCH_KEYWORD_PARAM) ?? "") === k) return null;
  if (k) url.searchParams.set(DELIVERY_SEARCH_KEYWORD_PARAM, k);
  else url.searchParams.delete(DELIVERY_SEARCH_KEYWORD_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
