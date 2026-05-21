/**
 * Owner orders list cache invalidate — [owner-orders-list-cache-invalidate] (dev observability).
 */

export type OwnerOrdersListCacheInvalidateLog = {
  route: string;
  store_id: string;
  order_id?: string;
  reason: string;
  invalidated: 0 | 1;
  cache_key_count: number;
  after_mutation_success: 0 | 1;
};

export function logOwnerOrdersListCacheInvalidate(row: OwnerOrdersListCacheInvalidateLog): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console
  console.info("[owner-orders-list-cache-invalidate]", JSON.stringify(row));
}
