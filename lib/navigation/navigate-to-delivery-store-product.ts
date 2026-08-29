/**
 * CUT 2B — canonical Delivery store/product navigation owner.
 *
 * OPTION A: two-stage Router navigation with route-commit stage-2.
 * 1) write NavigationEntryContext (historyIncludesStoreParent=true for product)
 * 2) arm pending product child
 * 3) router.push(STORE)
 * 4) StoreConsumerShell commits pending → router.push(PRODUCT) after store route committed
 *
 * Cards MUST NOT call router.push(store)+router.push(product) themselves.
 */

import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
import { armStoreMenuFocusEntryIntent } from "@/lib/dibay/store-menu-focus-entry-intent";
import { storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";
import {
  commitDeliveryStoreNavigationEntry,
  type CommitDeliveryStoreEntryInput,
} from "@/lib/navigation/dibay-navigation-context-store";
import {
  armDeliveryStoreProductPending,
  clearDeliveryStoreProductPending,
  type DeliveryStoreProductChildMode,
} from "@/lib/navigation/delivery-store-product-pending";
import { writeNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";
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

/**
 * PRODUCT FROM list/shelf/search — history becomes ORIGIN → STORE → PRODUCT.
 */
export function navigateToDeliveryStoreProduct(
  router: NavRouter,
  input: NavigateToDeliveryStoreProductInput
): void {
  const storeSlug = input.storeSlug.trim();
  const productId = input.productId.trim();
  if (!storeSlug || !productId) return;

  const loc = resolveLocation(input.pathname, input.search);
  const childMode: DeliveryStoreProductChildMode = input.childMode ?? "focusProduct";
  const transactionId = newTransactionId();

  if (input.saveScroll !== false) {
    saveDeliveryListScrollBeforeStoreNavigation();
  }

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
    historyIncludesStoreParent: true,
    transactionId,
  });

  if (childMode === "focusProduct") {
    armStoreMenuFocusEntryIntent(productId);
  }

  armDeliveryStoreProductPending({
    storeSlug,
    productId,
    childMode,
    transactionId,
  });

  router.push(storeDetailHrefFromSlug(storeSlug), { scroll: false });
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
