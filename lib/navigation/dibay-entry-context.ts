/**
 * DIBAY Global Back Navigation — NavigationEntryContext (CUT 1 SSOT).
 *
 * CONTRACT:
 * - UI components do not invent destination policy.
 * - originHref is full pathname+search (internal routes only).
 * - Product-from-list entries carry semanticParentHref (store menu).
 * - DO NOT clear HOME/SEARCH as "non-browse".
 */

export const DIBAY_NAV_ENTRY_CONTEXT_VERSION = 1 as const;

export const DIBAY_NAV_ENTRY_DEFAULT_TTL_MS = 120_000;

export type DibayOriginSurface =
  | "HOME"
  | "HOME_SHELF"
  | "BROWSE_LIST"
  | "SEARCH"
  | "STORE_DETAIL"
  | "CART"
  | "ORDER"
  | "NOTIFICATION"
  | "CHAT"
  | "DEEP_LINK"
  | "EXTERNAL";

export type DibayReturnMode =
  | "HISTORY"
  | "ORIGIN"
  | "SEMANTIC_PARENT"
  | "FLOW"
  | "CLOSE";

export type DibayDeliveryEntryKind = "store_card" | "product_from_list";

export type NavigationEntryContext = {
  version: typeof DIBAY_NAV_ENTRY_CONTEXT_VERSION;
  originSurface: DibayOriginSurface;
  /** pathname + search; null only for deep-link / missing origin */
  originHref: string | null;
  /** Store menu root for product-from-list depth; null for store-card */
  semanticParentHref: string | null;
  entityType: string;
  entityId: string | null;
  storeId?: string | null;
  storeSlug?: string | null;
  productId?: string | null;
  entryKind: DibayDeliveryEntryKind;
  returnMode: DibayReturnMode;
  restoreKey?: string | null;
  transactionId?: string | null;
  createdAt: number;
  ttlMs: number;
};

export type BackResolution =
  | { action: "CLOSE"; reason: string }
  | { action: "HISTORY"; reason: string; fallbackHref?: string | null }
  | {
      action: "PUSH" | "REPLACE";
      targetHref: string;
      restoreKey?: string | null;
      reason: string;
    };

/** Internal path only — rejects protocol / open-redirect. */
export function sanitizeDibayInternalHref(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  try {
    const u = new URL(trimmed, "https://dibay.local");
    if (u.username || u.password) return null;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const search = u.searchParams.toString();
    return search ? `${path}?${search}` : path;
  } catch {
    return null;
  }
}

export function buildHrefFromPathAndSearch(pathname: string, search: string): string {
  const path = (pathname || "/").split("?")[0] || "/";
  const q = (search ?? "").replace(/^\?/, "").trim();
  return q ? `${path}?${q}` : path;
}

export function classifyDeliveryOriginSurface(
  pathname: string,
  search = ""
): { surface: DibayOriginSurface; originHref: string } | null {
  const path = (pathname || "").split("?")[0] || "";
  const href = buildHrefFromPathAndSearch(path, search);

  if (path === "/stores") {
    return { surface: "HOME", originHref: href };
  }
  if (path === "/stores/search" || path.startsWith("/stores/search/")) {
    return { surface: "SEARCH", originHref: href };
  }
  if (/^\/stores\/browse\/[^/]+$/.test(path)) {
    return { surface: "BROWSE_LIST", originHref: href };
  }
  return null;
}

export function isNavigationEntryContextFresh(
  ctx: NavigationEntryContext | null | undefined,
  now = Date.now()
): ctx is NavigationEntryContext {
  if (!ctx || ctx.version !== DIBAY_NAV_ENTRY_CONTEXT_VERSION) return false;
  if (!Number.isFinite(ctx.createdAt) || !Number.isFinite(ctx.ttlMs)) return false;
  return ctx.createdAt + ctx.ttlMs >= now;
}

export function storeMenuHrefFromSlug(storeSlug: string): string {
  return `/stores/${encodeURIComponent(storeSlug.trim())}`;
}
