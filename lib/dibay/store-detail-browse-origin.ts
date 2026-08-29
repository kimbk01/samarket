import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";
import { commitDeliveryStoreNavigationEntry } from "@/lib/navigation/dibay-navigation-context-store";
import { sanitizeDibayInternalHref } from "@/lib/navigation/dibay-entry-context";
import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";

/**
 * Legacy browse primary+sub session helpers — ADAPTED under NavigationEntryContext (CUT 2).
 *
 * HARD LOCK:
 * - DO NOT clear HOME/SEARCH as non-browse.
 * - New writes go through commitDeliveryStoreNavigationEntry (full originHref).
 * - readStoreDetailBrowseOrigin derives primary/sub from stored originHref when browse.
 */

const LEGACY_KEY_PREFIX = "dibay:store-detail-browse-origin:";
const TTL_MS = 45_000;

export type StoreDetailBrowseOrigin = {
  primarySlug: string;
  subSlug: string;
};

function ssKey(storeSlug: string): string {
  return LEGACY_KEY_PREFIX + storeSlug.trim().toLowerCase();
}

function normalizeSubSlug(subSlug: string | null | undefined): string {
  const s = (subSlug ?? "").trim().toLowerCase();
  return s && s !== STORES_BROWSE_SUB_ALL ? s : STORES_BROWSE_SUB_ALL;
}

/** @deprecated Prefer commitDeliveryStoreNavigationEntry — kept for unit tests of primary/sub shape. */
export function writeStoreDetailBrowseOrigin(
  storeSlug: string,
  primarySlug: string,
  subSlug?: string | null
): void {
  const primary = primarySlug.trim().toLowerCase();
  if (!storeSlug.trim() || !primary) return;
  const sub = normalizeSubSlug(subSlug);
  const originHref =
    sub === STORES_BROWSE_SUB_ALL
      ? `/stores/browse/${encodeURIComponent(primary)}?sub=all`
      : `/stores/browse/${encodeURIComponent(primary)}?sub=${encodeURIComponent(sub)}`;
  commitDeliveryStoreNavigationEntry({
    storeSlug,
    pathname: `/stores/browse/${primary}`,
    search: `?sub=${sub}`,
    productId: null,
  });
  // Also keep legacy key for mid-migration readers
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      ssKey(storeSlug),
      JSON.stringify({
        primarySlug: primary,
        subSlug: sub,
        saved_at: Date.now(),
        originHref,
      })
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
 * Intentional entry commit — full origin via NavigationEntryContext.
 * HOME / SEARCH / BROWSE all preserved (no clear-on-non-browse).
 */
export function commitStoreDetailBrowseOriginForEntry(
  storeSlug: string,
  pathname: string,
  search: string,
  productId?: string | null
): void {
  commitDeliveryStoreNavigationEntry({
    storeSlug,
    pathname,
    search,
    productId: productId ?? null,
  });
}

export function readStoreDetailBrowseOrigin(storeSlug: string): StoreDetailBrowseOrigin | null {
  const ctx = readNavigationEntryContext(storeSlug);
  if (ctx?.originHref) {
    const safe = sanitizeDibayInternalHref(ctx.originHref);
    if (safe) {
      const primary = parseBrowsePrimarySlugFromPathname(safe);
      if (primary) {
        return {
          primarySlug: primary,
          subSlug: parseBrowseSubSlugFromSearch(safe.includes("?") ? safe.slice(safe.indexOf("?")) : ""),
        };
      }
    }
  }

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
  const qs = raw.startsWith("?") ? raw.slice(1) : raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
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
