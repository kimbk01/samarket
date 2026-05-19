import { isStoreCommerceCartCheckoutPath } from "@/lib/stores/store-cart-page-layout";

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

/** 동일 매장 소비자 경로(`/stores/:slug` 및 `/cart`·`/p` 등, `/owner` 제외) */
export function isStoreSlugConsumerSubtree(
  pathname: string | null | undefined,
  slugParam: string
): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.replace(/\/$/, "") ?? "";
  const slugDec = decodeSlugSegment(slugParam);
  if (!slugDec || !path.startsWith("/stores/")) return false;
  const rest = path.slice("/stores/".length);
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  const pathSlug = decodeSlugSegment(segments[0] ?? "");
  if (pathSlug !== slugDec && pathSlug.toLowerCase() !== slugDec.toLowerCase()) {
    return false;
  }
  if (segments[1] === "owner") return false;
  return true;
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

const STORE_PRODUCT_DETAIL_PATH = /^\/stores\/[^/]+\/p\/[^/]+$/;

/**
 * `StoreDetailSlideShell` 적용 여부 — cart/checkout/상품상세는 자체 스크롤 셸(뷰포트 잠금)이라 제외.
 * `isStoreSlugConsumerSubtree` 보다 먼저 판별해야 cart 가 슬라이드 transform 에 감싸이지 않는다.
 */
export function shouldWrapStoreDetailSlideShell(
  pathname: string | null | undefined,
  slugParam: string
): boolean {
  const path = (pathname ?? "").split("?")[0]?.replace(/\/+$/, "") ?? "";
  if (!path || path.includes("/owner/")) return false;
  if (!isStoreSlugConsumerSubtree(pathname, slugParam)) return false;
  if (isStoreCommerceCartCheckoutPath(path)) return false;
  if (STORE_PRODUCT_DETAIL_PATH.test(path)) return false;
  return true;
}
