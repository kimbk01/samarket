/**
 * STORE public identity SSOT — Delivery / cart / order target / owner console.
 *
 * CONTRACT
 * - UUID       = stores.id
 * - DISPLAY    = stores.store_name
 * - PUBLIC ID  = stores.slug
 *
 * DO NOT import Member identity helpers to invent store names.
 */

export type PublicStoreIdentity = {
  storeId: string;
  storeName: string;
  slug: string | null;
};

export type StoreIdentityRowFields = {
  id?: unknown;
  store_name?: unknown;
  slug?: unknown;
};

function pickTrimmed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function resolvePublicStoreIdentity(
  row: StoreIdentityRowFields | null | undefined,
  opts?: { storeId?: string; fallbackName?: string }
): PublicStoreIdentity | null {
  const storeId = pickTrimmed(opts?.storeId) ?? pickTrimmed(row?.id);
  if (!storeId) return null;
  const storeName =
    pickTrimmed(row?.store_name) ||
    pickTrimmed(opts?.fallbackName) ||
    "Store";
  return {
    storeId,
    storeName,
    slug: pickTrimmed(row?.slug),
  };
}
