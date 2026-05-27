/** `/stores` 홈 LCP — SSR hero 고정·feed 이미지 경쟁 완화 (Phase 9-C) */

/** 첫 레일 food 카드 — LCP 경쟁 방지: eager/priority 없음 (lazy only) */
export const STORES_HOME_FIRST_RAIL_CARD_PRIORITY_COUNT = 0;

/** featured-items eager batch — 첫 1매장만 */
export const STORES_HOME_FIRST_RAIL_FEATURED_EAGER = 1;

/** featured hydration IO — below-fold 선행 fetch 축소 */
export const STORES_HOME_FEATURED_VIEWPORT_ROOT_MARGIN = "48px 0px";

/** below-fold 섹션 intersection — 120px → 48px */
export const STORES_HOME_BELOW_FOLD_ROOT_MARGIN = "48px 0px 0px";

/** SSR LCP 후 client feed rail 마운트 fallback */
export const STORES_HOME_FEED_RAIL_AFTER_LCP_FALLBACK_MS = 2400;

/** SSR shell → client swap fallback (LCP observer 미지원) */
export const STORES_HOME_CLIENT_AFTER_LCP_FALLBACK_MS = 2400;

export const STORES_HOME_LCP_HERO_ATTR = "data-stores-lcp";

/** Phase 9-C — mandatory gate 등 오버레이 LCP 경쟁 회피 대상 경로 */
export function isStoresHomeLcpPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  return p === "/stores";
}
