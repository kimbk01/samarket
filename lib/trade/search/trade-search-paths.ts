/**
 * 거래 전용 찾기 화면 (재설계 4-1, Owner 2026-10-28 승인).
 * 거래 헤더 돋보기 → `/market/search?<지금 목록 조건>` → 찾기 → `/market?<같은 조건>&q=`.
 * 전역 `/search` 와 다른 화면이다(다른 도메인 돋보기는 그대로).
 */

export const TRADE_SEARCH_PATH = "/market/search" as const;

/** 페이지 위치는 조건이 아니라 새 결과에서 버린다 */
const DROP_KEYS = ["page", "cursor"] as const;

export function isTradeSearchPath(pathname: string | null | undefined): boolean {
  const p = (typeof pathname === "string" ? pathname : "").split("?")[0]!.split("#")[0]!.trim();
  return p === TRADE_SEARCH_PATH || p.startsWith(`${TRADE_SEARCH_PATH}/`);
}

function cleanParams(search: string): URLSearchParams {
  const sp = new URLSearchParams((search ?? "").replace(/^\?/, ""));
  for (const k of DROP_KEYS) sp.delete(k);
  return sp;
}

/** 목록의 지금 조건(검색어 포함 — 입력창에 미리 채움)을 그대로 들고 찾기 화면으로 */
export function buildTradeSearchEntryHref(listSearch: string): string {
  const qs = cleanParams(listSearch).toString();
  return qs ? `${TRADE_SEARCH_PATH}?${qs}` : TRADE_SEARCH_PATH;
}

/** 찾기 화면의 조건은 유지하고 검색어만 바꿔 거래 목록으로 */
export function buildTradeSearchResultHref(entrySearch: string, keyword: string): string {
  const sp = cleanParams(entrySearch);
  const k = keyword.trim().replace(/\s+/g, " ");
  if (k) sp.set("q", k);
  else sp.delete("q");
  const qs = sp.toString();
  return qs ? `/market?${qs}` : "/market";
}
