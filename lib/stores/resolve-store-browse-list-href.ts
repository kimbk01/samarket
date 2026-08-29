import { STORES_BROWSE_SUB_ALL, storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { parseBrowseSubSlugFromSearch } from "@/lib/dibay/store-detail-browse-origin";
import { sanitizeDibayInternalHref } from "@/lib/navigation/dibay-entry-context";
import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";
import { DIBAY_DELIVERY_ROOT_FALLBACK } from "@/lib/navigation/resolve-dibay-back-target";

/**
 * @deprecated CUT 2 — Back destination authority is resolveDibayBackTarget.
 * Kept for non-back callers that still need a list href hint.
 *
 * CONTRACT (CUT 2):
 * - Prefer NavigationEntryContext.originHref (full href).
 * - DO NOT invent browse URL from DB store category / businessType for back.
 * - Missing origin → /stores root fallback.
 */
export type StoreBrowseListHrefInput = {
  storeSlug?: string | null;
  /** Ignored for back destination (legacy signature). */
  storeCategorySlug?: string | null;
  /** Ignored for back destination (legacy signature). */
  businessType?: string | null;
};

type RelSlug = { slug?: string | null } | null | undefined;

function embedCategorySlug(rel: RelSlug | RelSlug[]): string | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return embedCategorySlug(rel[0]);
  const s = String(rel.slug ?? "").trim().toLowerCase();
  return s || null;
}

/**
 * List href for a store's last intentional entry origin — full href when present.
 */
export function resolveStoreBrowseListHref(input: StoreBrowseListHrefInput): string {
  const slug = input.storeSlug?.trim();
  if (!slug) return DIBAY_DELIVERY_ROOT_FALLBACK;

  const ctx = readNavigationEntryContext(slug);
  const fromCtx = ctx?.originHref ? sanitizeDibayInternalHref(ctx.originHref) : null;
  if (fromCtx) return fromCtx;

  return DIBAY_DELIVERY_ROOT_FALLBACK;
}

export function storeCategorySlugFromStoreRow(
  store: {
    store_categories?: RelSlug | RelSlug[];
    business_type?: string | null;
  } | null
): string | null {
  if (!store) return null;
  return embedCategorySlug(store.store_categories as RelSlug | RelSlug[]);
}

export function resolveStoreBrowseListHrefFromStore(
  store: {
    slug: string;
    store_categories?: RelSlug | RelSlug[];
    business_type?: string | null;
  } | null
): string {
  if (!store?.slug?.trim()) return DIBAY_DELIVERY_ROOT_FALLBACK;
  return resolveStoreBrowseListHref({
    storeSlug: store.slug,
    storeCategorySlug: storeCategorySlugFromStoreRow(store),
    businessType: store.business_type ?? null,
  });
}

/** Test/helper — reconstruct browse path only when explicitly given primary/sub (not from DB). */
export function storesBrowseHrefFromPrimarySub(
  primarySlug: string,
  subSlug: string = STORES_BROWSE_SUB_ALL
): string {
  return storesBrowsePath(primarySlug, parseBrowseSubSlugFromSearch(`?sub=${subSlug}`));
}
