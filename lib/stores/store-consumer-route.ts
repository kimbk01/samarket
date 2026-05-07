/**
 * 소비자 `/stores/[slug]/*` 레이아웃 분기 — 메뉴 루트만 Tier1 스티키바 생략 등에 사용.
 */
export function decodeSlugSegment(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

/** `/stores/search`·`/stores/cart` 등 단일 세그먼트지만 매장 슬러그가 아닌 경로 */
const STORES_TOP_LEVEL_NON_SLUG = new Set(["search", "browse", "cart"]);

/**
 * 소비자 주문 매장 메뉴 루트 `/stores/[slug]` 만 true (`/stores/foo/cart` 등은 false).
 * 앱 셸 배경(당김 시 상단 빈 줄) 과 동기할 때 pathname 만으로 판별.
 */
export function isStoresConsumerSlugMenuRoute(pathname: string | null | undefined): boolean {
  const normalized = ((pathname ?? "").split("?")[0] ?? "").trim().replace(/\/+$/, "") || "";
  const m = normalized.match(/^\/stores\/([^/]+)$/);
  if (!m) return false;
  const topSeg = decodeSlugSegment(m[1] ?? "").trim().toLowerCase();
  if (!topSeg) return false;
  return !STORES_TOP_LEVEL_NON_SLUG.has(topSeg);
}

/** `/stores/:slug` 단일 세그먼트(주문 메뉴 홈)인지 — 하위 경로(/cart, /info 등)는 false */
export function isStoreSlugOrderMenuRoot(pathname: string | null, slugParam: string): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.replace(/\/$/, "") ?? "";
  const slugDec = decodeSlugSegment(slugParam);
  if (!slugDec || !path.startsWith("/stores/")) return false;
  const rest = path.slice("/stores/".length);
  const segments = rest.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const pathSlug = decodeSlugSegment(segments[0] ?? "");
  return pathSlug === slugDec || pathSlug.toLowerCase() === slugDec.toLowerCase();
}
