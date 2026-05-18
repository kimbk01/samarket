/**
 * 목록(browse) → 매장 상세 진입 시 1차 업종 slug 를 기억해,
 * 상세 뒤로가기가 해당 업종 전체 목록(`/stores/browse/{primary}?sub=all`)으로 가도록 한다.
 */

const KEY_PREFIX = "dibay:store-detail-browse-origin:";
const TTL_MS = 45_000;

function ssKey(storeSlug: string): string {
  return KEY_PREFIX + storeSlug.trim().toLowerCase();
}

export function writeStoreDetailBrowseOrigin(storeSlug: string, primarySlug: string): void {
  if (typeof sessionStorage === "undefined") return;
  const slug = storeSlug.trim();
  const primary = primarySlug.trim().toLowerCase();
  if (!slug || !primary) return;
  try {
    sessionStorage.setItem(
      ssKey(slug),
      JSON.stringify({ primarySlug: primary, saved_at: Date.now() })
    );
  } catch {
    /* quota */
  }
}

export function readStoreDetailBrowseOrigin(storeSlug: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const slug = storeSlug.trim();
  if (!slug) return null;
  try {
    const raw = sessionStorage.getItem(ssKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { primarySlug?: string; saved_at?: number };
    if (!parsed?.primarySlug || !parsed.saved_at || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(ssKey(slug));
      return null;
    }
    return parsed.primarySlug.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/** `/stores/browse/restaurant?sub=korean` → `restaurant` */
export function parseBrowsePrimarySlugFromPathname(pathname: string): string | null {
  const path = (pathname || "").split("?")[0] ?? "";
  const m = path.match(/^\/stores\/browse\/([^/]+)/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).trim().toLowerCase() || null;
  } catch {
    return m[1].trim().toLowerCase() || null;
  }
}
