/** Compatibility fields from the retired store-credit product. */

export type StorePointCommerceFields = {
  point_commerce_blocked?: boolean | null;
  point_balance?: number | null;
};

export function isStorePointCommerceBlocked(
  _store: StorePointCommerceFields | null | undefined
): boolean {
  return false;
}

/** Ordering availability is determined only by the canonical store schedule. */
export function resolveStoreFrontOrderable(
  scheduleOpen: boolean,
  _store: StorePointCommerceFields | null | undefined
): boolean {
  return scheduleOpen;
}
