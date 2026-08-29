/**
 * Canonical Back resolver (CUT 1) — Delivery cutover (CUT 2).
 *
 * Priority is not a blind ladder: entry context + current route select exactly one
 * BackResolution. UI must not re-decide destinations.
 */

import {
  sanitizeDibayInternalHref,
  storeMenuHrefFromSlug,
  type BackResolution,
  type NavigationEntryContext,
  isNavigationEntryContextFresh,
} from "@/lib/navigation/dibay-entry-context";
import { STORE_DETAIL_FOCUS_PRODUCT_QUERY } from "@/lib/dibay/store-detail-href";
import {
  decodeSlugSegment,
  isStoreProductDetailConsumerPath,
  isStoreSlugOrderMenuRoot,
} from "@/lib/stores/store-consumer-route";

export const DIBAY_DELIVERY_ROOT_FALLBACK = "/stores";

export type ResolveDibayBackTargetInput = {
  currentPathname: string;
  currentSearch?: string;
  storeSlug: string;
  entryContext: NavigationEntryContext | null;
  /** Overlay/sheet open — CLOSE only (native adapter later). */
  overlayOpen?: boolean;
  now?: number;
};

function pathOnly(pathname: string): string {
  return (pathname || "").split("?")[0]?.replace(/\/+$/, "") || "";
}

function focusProductIdFromSearch(search: string | undefined): string | null {
  const raw = (search ?? "").replace(/^\?/, "");
  const id = new URLSearchParams(raw).get(STORE_DETAIL_FOCUS_PRODUCT_QUERY)?.trim();
  return id || null;
}

function isStoreInfoOrReviewsChild(pathname: string, storeSlug: string): boolean {
  const path = pathOnly(pathname);
  const root = storeMenuHrefFromSlug(storeSlug);
  if (path === `${root}/info` || path.startsWith(`${root}/info/`)) return true;
  if (path === `${root}/reviews` || path.startsWith(`${root}/reviews/`)) return true;
  return false;
}

function originResolution(ctx: NavigationEntryContext | null): BackResolution {
  const origin = ctx?.originHref ? sanitizeDibayInternalHref(ctx.originHref) : null;
  if (origin) {
    return {
      action: "HISTORY",
      reason: `origin_return:${ctx?.originSurface ?? "unknown"}`,
      fallbackHref: origin,
    };
  }
  return {
    action: "PUSH",
    targetHref: DIBAY_DELIVERY_ROOT_FALLBACK,
    restoreKey: null,
    reason: "root_fallback_no_origin",
  };
}

/**
 * Resolve one Back action for Delivery store consumer surfaces.
 */
export function resolveDibayBackTarget(input: ResolveDibayBackTargetInput): BackResolution {
  if (input.overlayOpen) {
    return { action: "CLOSE", reason: "overlay_close" };
  }

  const slug = input.storeSlug.trim();
  const path = pathOnly(input.currentPathname);
  const search = input.currentSearch ?? "";
  const now = input.now ?? Date.now();
  const ctx =
    input.entryContext && isNavigationEntryContextFresh(input.entryContext, now)
      ? input.entryContext
      : null;

  const storeRoot = storeMenuHrefFromSlug(slug);
  const focusId = focusProductIdFromSearch(search);
  const onProductPage = isStoreProductDetailConsumerPath(path);
  const onMenuRoot = isStoreSlugOrderMenuRoot(path, slug);
  const onInfoOrReviews = isStoreInfoOrReviewsChild(path, slug);

  // Store child chrome (info / reviews) → menu root
  if (onInfoOrReviews) {
    return {
      action: "PUSH",
      targetHref: storeRoot,
      restoreKey: null,
      reason: "semantic_parent_store_menu_from_child",
    };
  }

  // Product depth: /p/{id} OR still-focused ?focusProduct=
  if (onProductPage || (onMenuRoot && focusId)) {
    const parent =
      (ctx?.semanticParentHref && sanitizeDibayInternalHref(ctx.semanticParentHref)) ||
      storeRoot;
    return {
      action: "REPLACE",
      targetHref: parent,
      restoreKey: null,
      reason: "semantic_parent_store_menu",
    };
  }

  // Store menu root — product entry already consumed focus → origin
  if (onMenuRoot) {
    if (ctx?.entryKind === "product_from_list") {
      return originResolution(ctx);
    }
    if (ctx?.entryKind === "store_card") {
      return originResolution(ctx);
    }
    // Stale / missing context — root fallback (never invent browse from DB category)
    return {
      action: "PUSH",
      targetHref: DIBAY_DELIVERY_ROOT_FALLBACK,
      restoreKey: null,
      reason: "root_fallback_stale_or_missing_context",
    };
  }

  // Other store subtree (rare) — prefer store menu then let next back use context
  if (path.startsWith("/stores/") && decodeSlugSegment(path.split("/")[2] ?? "") === slug) {
    return {
      action: "PUSH",
      targetHref: storeRoot,
      restoreKey: null,
      reason: "semantic_parent_store_menu_subtree",
    };
  }

  return originResolution(ctx);
}

/**
 * Pure helper for tests — equivalent entry contexts must resolve equivalently
 * for focusProduct vs /p/ product paths at the product-depth step.
 */
export function resolveDeliveryProductDepthBack(args: {
  storeSlug: string;
  entryContext: NavigationEntryContext;
  pathMode: "focusProduct" | "productPage";
  productId: string;
}): BackResolution {
  const slug = args.storeSlug.trim();
  const pid = args.productId.trim();
  if (args.pathMode === "focusProduct") {
    return resolveDibayBackTarget({
      currentPathname: storeMenuHrefFromSlug(slug),
      currentSearch: `?${STORE_DETAIL_FOCUS_PRODUCT_QUERY}=${encodeURIComponent(pid)}`,
      storeSlug: slug,
      entryContext: args.entryContext,
    });
  }
  return resolveDibayBackTarget({
    currentPathname: `${storeMenuHrefFromSlug(slug)}/p/${encodeURIComponent(pid)}`,
    currentSearch: "",
    storeSlug: slug,
    entryContext: args.entryContext,
  });
}
