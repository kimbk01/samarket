/**
 * Global-shell projection for Delivery Owner navigation identity.
 * Shell surfaces may subscribe here; they must not import Owner order/list Stores.
 */
export type OwnerNavigationSummary = {
  storeId: string | null;
  storeSlug: string | null;
  storeName: string | null;
  hasPreferredStore: boolean;
  loading: boolean;
};

export const EMPTY_OWNER_NAVIGATION_SUMMARY: OwnerNavigationSummary = {
  storeId: null,
  storeSlug: null,
  storeName: null,
  hasPreferredStore: false,
  loading: true,
};

export function ownerNavigationSummaryFromPreferredStore(input: {
  loading: boolean;
  store: {
    id?: string | null;
    slug?: string | null;
    store_name?: string | null;
  } | null;
}): OwnerNavigationSummary {
  const storeId = String(input.store?.id ?? "").trim() || null;
  const storeSlug = String(input.store?.slug ?? "").trim() || null;
  const storeName = String(input.store?.store_name ?? "").trim() || null;
  return {
    storeId,
    storeSlug,
    storeName,
    hasPreferredStore: Boolean(storeId),
    loading: input.loading,
  };
}
