import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";

/**
 * browse → 매장 상세 진입 시 **이번 entry** 의 1·2차 업종을 기록해
 * 상세 「목록으로」가 직전 browse 목록으로 복귀하게 한다.
 *
 * CONTRACT:
 * - LATEST ENTRY WINS — store card 탭마다 current browse origin 으로 ALWAYS overwrite
 * - TTL(45s) = stale navigation fallback 폐기만 (overwrite 금지 근거 아님)
 * - browse URL 이 아닌 진입(홈 피드 등)은 origin clear → DB/businessType fallback
 */

const KEY_PREFIX = "dibay:store-detail-browse-origin:";
const TTL_MS = 45_000;

export type StoreDetailBrowseOrigin = {
  primarySlug: string;
  subSlug: string;
};

function ssKey(storeSlug: string): string {
  return KEY_PREFIX + storeSlug.trim().toLowerCase();
}

function normalizeSubSlug(subSlug: string | null | undefined): string {
  const s = (subSlug ?? "").trim().toLowerCase();
  return s && s !== STORES_BROWSE_SUB_ALL ? s : STORES_BROWSE_SUB_ALL;
}

export function writeStoreDetailBrowseOrigin(
  storeSlug: string,
  primarySlug: string,
  subSlug?: string | null,
): void {
  if (typeof sessionStorage === "undefined") return;
  const slug = storeSlug.trim();
  const primary = primarySlug.trim().toLowerCase();
  if (!slug || !primary) return;
  try {
    sessionStorage.setItem(
      ssKey(slug),
      JSON.stringify({
        primarySlug: primary,
        subSlug: normalizeSubSlug(subSlug),
        saved_at: Date.now(),
      }),
    );
  } catch {
    /* quota */
  }
}

export function clearStoreDetailBrowseOrigin(storeSlug: string): void {
  if (typeof sessionStorage === "undefined") return;
  const slug = storeSlug.trim();
  if (!slug) return;
  try {
    sessionStorage.removeItem(ssKey(slug));
  } catch {
    /* ignore */
  }
}

/**
 * Detail entry commit — pathname browse primary 가 있으면 overwrite, 없으면 stale clear.
 * DO NOT: existing origin 유지 / write skip.
 */
export function commitStoreDetailBrowseOriginForEntry(
  storeSlug: string,
  pathname: string,
  search: string,
): void {
  const primary = parseBrowsePrimarySlugFromPathname(pathname);
  if (primary) {
    writeStoreDetailBrowseOrigin(storeSlug, primary, parseBrowseSubSlugFromSearch(search));
    return;
  }
  clearStoreDetailBrowseOrigin(storeSlug);
}

export function readStoreDetailBrowseOrigin(storeSlug: string): StoreDetailBrowseOrigin | null {
  if (typeof sessionStorage === "undefined") return null;
  const slug = storeSlug.trim();
  if (!slug) return null;
  try {
    const raw = sessionStorage.getItem(ssKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      primarySlug?: string;
      subSlug?: string;
      saved_at?: number;
    };
    if (!parsed?.primarySlug || !parsed.saved_at || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(ssKey(slug));
      return null;
    }
    const primarySlug = parsed.primarySlug.trim().toLowerCase();
    if (!primarySlug) return null;
    return {
      primarySlug,
      subSlug: normalizeSubSlug(parsed.subSlug),
    };
  } catch {
    return null;
  }
}

/** `?sub=korean` → `korean` (없음·all → `all`) */
export function parseBrowseSubSlugFromSearch(search: string): string {
  const raw = (search ?? "").trim();
  const qs = raw.startsWith("?") ? raw.slice(1) : raw;
  const sub = new URLSearchParams(qs).get("sub")?.trim().toLowerCase() ?? "";
  return sub && sub !== STORES_BROWSE_SUB_ALL ? sub : STORES_BROWSE_SUB_ALL;
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
