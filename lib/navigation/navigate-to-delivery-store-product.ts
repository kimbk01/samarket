/**
 * CUT 2B / SINGLE-ACTION — canonical Delivery store/product navigation owner.
 *
 * Contract:
 * - ONE user product intent → ONE history semantic mutation → ONE route push.
 * - HOME/browse/search → PRODUCT: direct product push; historyIncludesStoreParent=false
 *   so BACK returns to the actual origin (HOME/browse), not a synthetic STORE.
 * - Already on STORE → PRODUCT: single product push; historyIncludesStoreParent=true
 *   so BACK returns to STORE.
 *
 * Cards MUST NOT call router.push themselves for product entry.
 * In-store menu MUST use navigateToDeliveryStoreProduct (not raw /p/ push).
 */

import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
import { armStoreMenuFocusEntryIntent } from "@/lib/dibay/store-menu-focus-entry-intent";
import { storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";
import {
  commitDeliveryStoreNavigationEntry,
  type CommitDeliveryStoreEntryInput,
  writeNavigationEntryContext,
} from "@/lib/navigation/dibay-navigation-context-store";
import {
  buildDeliveryStoreProductChildHref,
  clearDeliveryStoreProductPending,
  type DeliveryStoreProductChildMode,
} from "@/lib/navigation/delivery-store-product-pending";
import { sanitizeDibayInternalHref } from "@/lib/navigation/dibay-entry-context";
import type { DibayOriginSurface } from "@/lib/navigation/dibay-entry-context";

type NavRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void;
};

function newTransactionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type NavigateToDeliveryStoreProductInput = {
  storeSlug: string;
  productId: string;
  storeId?: string | null;
  childMode?: DeliveryStoreProductChildMode;
  pathname?: string;
  search?: string;
  originHrefOverride?: string | null;
  originSurfaceOverride?: DibayOriginSurface | null;
  /** When false, skip scroll save (caller already saved). Default true. */
  saveScroll?: boolean;
};

export type NavigateToDeliveryStoreCardInput = {
  storeSlug: string;
  storeId?: string | null;
  pathname?: string;
  search?: string;
  originHrefOverride?: string | null;
  originSurfaceOverride?: DibayOriginSurface | null;
  saveScroll?: boolean;
  /** Full href override (rare). Default store menu root. */
  href?: string;
};

function resolveLocation(pathname?: string, search?: string): { pathname: string; search: string } {
  if (pathname != null) {
    return { pathname, search: search ?? "" };
  }
  if (typeof window !== "undefined") {
    return { pathname: window.location.pathname, search: window.location.search };
  }
  return { pathname: "/stores", search: "" };
}

/** True when pathname is already this store's menu or a child under it. */
export function isDeliveryAlreadyOnStoreSurface(pathname: string, storeSlug: string): boolean {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  const slug = storeSlug.trim();
  if (!slug) return false;
  const candidates = [`/stores/${encodeURIComponent(slug)}`, `/stores/${slug}`];
  for (const root of candidates) {
    if (path === root || path.startsWith(`${root}/`)) return true;
  }
  return false;
}

/**
 * PRODUCT intent — single history push to product (or focus) href.
 * No synthetic STORE layer when opening from HOME/browse/search.
 */
export function navigateToDeliveryStoreProduct(
  router: NavRouter,
  input: NavigateToDeliveryStoreProductInput
): void {
  const storeSlug = input.storeSlug.trim();
  const productId = input.productId.trim();
  if (!storeSlug || !productId) return;

  const loc = resolveLocation(input.pathname, input.search);
  const childMode: DeliveryStoreProductChildMode = input.childMode ?? "productPage";
  const transactionId = newTransactionId();
  const alreadyOnStore = isDeliveryAlreadyOnStoreSurface(loc.pathname, storeSlug);

  if (input.saveScroll !== false) {
    saveDeliveryListScrollBeforeStoreNavigation();
  }

  // Drop any legacy two-stage pending — single-action contract forbids stage-2 push.
  clearDeliveryStoreProductPending(storeSlug);

  const ctx = commitDeliveryStoreNavigationEntry({
    storeSlug,
    pathname: loc.pathname,
    search: loc.search,
    productId,
    storeId: input.storeId ?? null,
    originHrefOverride: input.originHrefOverride,
    originSurfaceOverride: input.originSurfaceOverride,
  });

  writeNavigationEntryContext({
    ...ctx,
    historyIncludesStoreParent: alreadyOnStore,
    transactionId,
  });

  if (childMode === "focusProduct") {
    armStoreMenuFocusEntryIntent(productId);
  }

  const rawHref = buildDeliveryStoreProductChildHref(storeSlug, productId, childMode);
  const productHref = sanitizeDibayInternalHref(rawHref) || rawHref;
  router.push(productHref, { scroll: false });
}

/**
 * STORE CARD — single history depth ORIGIN → STORE. No product pending.
 */
export function navigateToDeliveryStoreCard(
  router: NavRouter,
  input: NavigateToDeliveryStoreCardInput
): void {
  const storeSlug = input.storeSlug.trim();
  if (!storeSlug) return;

  const loc = resolveLocation(input.pathname, input.search);
  clearDeliveryStoreProductPending(storeSlug);

  if (input.saveScroll !== false) {
    saveDeliveryListScrollBeforeStoreNavigation();
  }

  const entry: CommitDeliveryStoreEntryInput = {
    storeSlug,
    pathname: loc.pathname,
    search: loc.search,
    productId: null,
    storeId: input.storeId ?? null,
    originHrefOverride: input.originHrefOverride,
    originSurfaceOverride: input.originSurfaceOverride,
  };
  commitDeliveryStoreNavigationEntry(entry);

  const href = input.href?.trim() || storeDetailHrefFromSlug(storeSlug);
  router.push(href, { scroll: false });
}
