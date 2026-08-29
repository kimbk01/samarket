/**
 * Session store for Delivery NavigationEntryContext (CUT 1).
 * Keyed by store slug — LATEST intentional entry wins.
 */

import {
  DIBAY_NAV_ENTRY_CONTEXT_VERSION,
  DIBAY_NAV_ENTRY_DEFAULT_TTL_MS,
  isNavigationEntryContextFresh,
  sanitizeDibayInternalHref,
  storeMenuHrefFromSlug,
  type DibayDeliveryEntryKind,
  type DibayOriginSurface,
  type DibayReturnMode,
  type NavigationEntryContext,
  classifyDeliveryOriginSurface,
  buildHrefFromPathAndSearch,
} from "@/lib/navigation/dibay-entry-context";
import { buildDeliveryListScrollRouteKey } from "@/lib/dibay/delivery-list-scroll-restore";

const KEY_PREFIX = "dibay:nav-entry-context:v1:";

function ssKey(storeSlug: string): string {
  return KEY_PREFIX + storeSlug.trim().toLowerCase();
}

function canUseSessionStorage(): boolean {
  return typeof sessionStorage !== "undefined";
}

export function writeNavigationEntryContext(ctx: NavigationEntryContext): void {
  if (!canUseSessionStorage()) return;
  const slug = ctx.storeSlug?.trim();
  if (!slug) return;
  const safeOrigin = ctx.originHref ? sanitizeDibayInternalHref(ctx.originHref) : null;
  const safeParent = ctx.semanticParentHref
    ? sanitizeDibayInternalHref(ctx.semanticParentHref)
    : null;
  const payload: NavigationEntryContext = {
    ...ctx,
    version: DIBAY_NAV_ENTRY_CONTEXT_VERSION,
    originHref: safeOrigin,
    semanticParentHref: safeParent,
    storeSlug: slug,
  };
  try {
    sessionStorage.setItem(ssKey(slug), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function readNavigationEntryContext(
  storeSlug: string,
  now = Date.now()
): NavigationEntryContext | null {
  if (!canUseSessionStorage()) return null;
  const slug = storeSlug.trim();
  if (!slug) return null;
  try {
    const raw = sessionStorage.getItem(ssKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavigationEntryContext;
    if (!isNavigationEntryContextFresh(parsed, now)) {
      sessionStorage.removeItem(ssKey(slug));
      return null;
    }
    if (parsed.storeSlug?.trim().toLowerCase() !== slug.toLowerCase()) {
      sessionStorage.removeItem(ssKey(slug));
      return null;
    }
    if (parsed.originHref && !sanitizeDibayInternalHref(parsed.originHref)) {
      sessionStorage.removeItem(ssKey(slug));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearNavigationEntryContext(storeSlug: string): void {
  if (!canUseSessionStorage()) return;
  const slug = storeSlug.trim();
  if (!slug) return;
  try {
    sessionStorage.removeItem(ssKey(slug));
  } catch {
    /* ignore */
  }
}

export type CommitDeliveryStoreEntryInput = {
  storeSlug: string;
  pathname: string;
  search: string;
  productId?: string | null;
  storeId?: string | null;
  /** Override when list surface is known but pathname is a modal host */
  originHrefOverride?: string | null;
  originSurfaceOverride?: DibayOriginSurface | null;
};

/**
 * Intentional list → store/product entry.
 * HOME / SEARCH / BROWSE write full originHref — never clear as "non-browse".
 */
export function commitDeliveryStoreNavigationEntry(
  input: CommitDeliveryStoreEntryInput
): NavigationEntryContext {
  const storeSlug = input.storeSlug.trim();
  const productId = input.productId?.trim() || null;
  const entryKind: DibayDeliveryEntryKind = productId ? "product_from_list" : "store_card";

  let surface: DibayOriginSurface = "DEEP_LINK";
  let originHref: string | null = null;

  const overrideHref = input.originHrefOverride
    ? sanitizeDibayInternalHref(input.originHrefOverride)
    : null;
  if (overrideHref && input.originSurfaceOverride) {
    surface = input.originSurfaceOverride;
    originHref = overrideHref;
  } else {
    const classified = classifyDeliveryOriginSurface(input.pathname, input.search);
    if (classified) {
      surface = productId && classified.surface === "HOME" ? "HOME_SHELF" : classified.surface;
      originHref = classified.originHref;
    } else if (overrideHref) {
      surface = input.originSurfaceOverride ?? "EXTERNAL";
      originHref = overrideHref;
    } else {
      surface = "DEEP_LINK";
      originHref = null;
    }
  }

  if (surface === "HOME_SHELF" && !productId) {
    surface = "HOME";
  }

  const semanticParentHref = productId ? storeMenuHrefFromSlug(storeSlug) : null;
  const returnMode: DibayReturnMode = productId ? "SEMANTIC_PARENT" : "ORIGIN";
  const restoreKey = originHref
    ? buildDeliveryListScrollRouteKey(
        originHref.split("?")[0] ?? originHref,
        originHref.includes("?") ? `?${originHref.split("?")[1] ?? ""}` : ""
      )
    : null;

  const ctx: NavigationEntryContext = {
    version: DIBAY_NAV_ENTRY_CONTEXT_VERSION,
    originSurface: surface,
    originHref,
    semanticParentHref,
    entityType: productId ? "store_product" : "store",
    entityId: productId ?? storeSlug,
    storeId: input.storeId ?? null,
    storeSlug,
    productId,
    entryKind,
    returnMode,
    restoreKey,
    transactionId: null,
    createdAt: Date.now(),
    ttlMs: DIBAY_NAV_ENTRY_DEFAULT_TTL_MS,
  };

  writeNavigationEntryContext(ctx);
  return ctx;
}

/** Build context snapshot for resolver unit tests (no session). */
export function buildDeliveryStoreNavigationEntryForTests(
  input: CommitDeliveryStoreEntryInput & { createdAt?: number; ttlMs?: number }
): NavigationEntryContext {
  const base = commitDeliveryStoreNavigationEntry(input);
  if (!canUseSessionStorage()) {
    return {
      ...base,
      createdAt: input.createdAt ?? base.createdAt,
      ttlMs: input.ttlMs ?? base.ttlMs,
    };
  }
  const patched: NavigationEntryContext = {
    ...base,
    createdAt: input.createdAt ?? base.createdAt,
    ttlMs: input.ttlMs ?? base.ttlMs,
  };
  writeNavigationEntryContext(patched);
  return patched;
}

export function currentWindowOriginHref(): string {
  if (typeof window === "undefined") return "/stores";
  return buildHrefFromPathAndSearch(window.location.pathname, window.location.search);
}
