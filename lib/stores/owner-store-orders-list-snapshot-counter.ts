/**
 * OOL1 owner store orders list snapshot counter keys.
 */
export const OWNER_STORE_ORDERS_LIST_SNAPSHOT_TABLE = "owner_store_orders_list_snapshots";
export const OWNER_STORE_ORDERS_LIST_SNAPSHOT_RPC = "get_owner_store_orders_list_snapshot";
export const OWNER_STORE_ORDERS_LIST_DEFAULT_SCOPE = "default";
export const OWNER_STORE_ORDERS_LIST_DEFAULT_LIMIT = 60;

export type OwnerStoreOrdersListSnapshotKeyParts = {
  store_id: string;
  owner_user_id: string;
  list_scope: string;
  status_filter: string;
  list_limit: number;
  cursor_key: string;
};

export function ownerStoreOrdersListSnapshotCacheKeyParts(input: {
  storeId: string;
  ownerUserId: string;
  status?: string;
  limit?: number;
  cursor?: string;
  listScope?: string;
}): OwnerStoreOrdersListSnapshotKeyParts {
  return {
    store_id: input.storeId.trim(),
    owner_user_id: input.ownerUserId.trim(),
    list_scope: input.listScope?.trim() || OWNER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
    status_filter: input.status?.trim() ?? "",
    list_limit: Math.max(1, Math.min(120, input.limit ?? OWNER_STORE_ORDERS_LIST_DEFAULT_LIMIT)),
    cursor_key: input.cursor?.trim() ?? "",
  };
}

export function ownerStoreOrdersListSnapshotCounterTtlMs(): number {
  const raw = process.env.OWNER_STORE_ORDERS_LIST_SNAPSHOT_COUNTER_TTL_MS?.trim();
  const n = raw ? Number(raw) : 45_000;
  return Number.isFinite(n) && n > 0 ? n : 45_000;
}

export function ownerStoreOrdersListSnapshotMemoryCacheKey(
  parts: OwnerStoreOrdersListSnapshotKeyParts
): string {
  return `owner-orders-list:${parts.store_id}:${parts.owner_user_id}:${parts.status_filter}:${parts.list_limit}:${parts.cursor_key}`;
}
