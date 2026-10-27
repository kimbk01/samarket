import { buildTradeMarketplaceDefaultBrowseHref } from "@/lib/trade/location/trade-marketplace-master-address-reset";

/** 검색어를 기본 browse href 에 다시 붙인다 (다른 파라미터는 그대로). */
export function withPreservedMarketplaceQuery(href: string, currentSearch: string): string {
  const q = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch)
    .get("q")
    ?.trim();
  if (!q) return href;
  const [path, qs = ""] = href.split("?");
  const sp = new URLSearchParams(qs);
  sp.set("q", q);
  return `${path}?${sp.toString()}`;
}

/**
 * ↺ 거래 화면 초기화 — 필터·카테고리·지역을 기본 browse(대표주소 CITY + 거리 전체 / 전국)로 되돌리되
 * 검색어 `q` 는 유지한다 (Owner 2026-10-27 TM-35). 대표주소 변경 리셋(q 포함 초기화)과는 별도.
 */
export async function buildMarketplaceBrowseResetCommittedHref(
  pathname: string,
  currentSearch: string
): Promise<string> {
  const href = await buildTradeMarketplaceDefaultBrowseHref(pathname, currentSearch);
  return withPreservedMarketplaceQuery(href, currentSearch);
}
