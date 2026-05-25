/** SOL1 buyer store orders list snapshot counter keys */
export const BUYER_STORE_ORDERS_LIST_SNAPSHOT_TABLE = "buyer_store_orders_list_snapshots";
export const BUYER_STORE_ORDERS_LIST_SNAPSHOT_RPC = "get_buyer_store_orders_list_snapshot";
export const BUYER_STORE_ORDERS_LIST_DEFAULT_SCOPE = "default";
export const BUYER_STORE_ORDERS_LIST_DEFAULT_LIMIT = 100;

export type BuyerStoreOrdersListSnapshotKeyParts = {
  buyer_user_id: string;
  list_scope: string;
  status_filter: string;
  list_limit: number;
  cursor_key: string;
};

export function buyerStoreOrdersListSnapshotCacheKeyParts(input: {
  buyerUserId: string;
  status?: string;
  limit?: number;
  cursor?: string;
  listScope?: string;
}): BuyerStoreOrdersListSnapshotKeyParts {
  return {
    buyer_user_id: input.buyerUserId.trim(),
    list_scope: input.listScope?.trim() || BUYER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
    status_filter: input.status?.trim() ?? "",
    list_limit: Math.max(1, Math.min(100, input.limit ?? BUYER_STORE_ORDERS_LIST_DEFAULT_LIMIT)),
    cursor_key: input.cursor?.trim() ?? "",
  };
}

export function buyerStoreOrdersListSnapshotCounterTtlMs(): number {
  const raw = process.env.BUYER_STORE_ORDERS_LIST_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 8_000;
  if (!Number.isFinite(n) || n < 1_000) return 8_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}
