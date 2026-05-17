/**
 * 배달 매장 상세 `/stores/[slug]` — 단일 href 빌더·파서.
 * route prefetch·탭·로그 키가 동일 문자열을 쓰도록 한다.
 */

export const STORE_DETAIL_FOCUS_PRODUCT_QUERY = "focusProduct";

export function storeDetailHrefFromSlug(slug: string): string {
  return `/stores/${encodeURIComponent(slug.trim())}`;
}

export function buildStoreDetailHref(
  slug: string,
  focusProductId?: string | null
): string {
  const base = storeDetailHrefFromSlug(slug);
  const productId = focusProductId?.trim();
  if (!productId) return base;
  const q = new URLSearchParams({ [STORE_DETAIL_FOCUS_PRODUCT_QUERY]: productId });
  return `${base}?${q.toString()}`;
}

/** pathname + search 정규화 — prefetch Map·sessionStorage 키 */
export function normalizeStoreDetailHref(href: string): string {
  const raw = href.trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw, "http://local");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const search = u.searchParams.toString();
    return search ? `${path}?${search}` : path;
  } catch {
    return raw;
  }
}

export function parseStoreDetailSlugFromHref(href: string): string | null {
  try {
    const u = new URL(normalizeStoreDetailHref(href), "http://local");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== "stores" || !parts[1]) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

export function parseStoreDetailFocusProductId(href: string): string | null {
  try {
    const u = new URL(normalizeStoreDetailHref(href), "http://local");
    const id = u.searchParams.get(STORE_DETAIL_FOCUS_PRODUCT_QUERY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function storeDetailBaseHref(href: string): string {
  const slug = parseStoreDetailSlugFromHref(href);
  return slug ? storeDetailHrefFromSlug(slug) : normalizeStoreDetailHref(href).split("?")[0] ?? href;
}
