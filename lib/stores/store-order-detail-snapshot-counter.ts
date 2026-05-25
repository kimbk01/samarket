/** SOD1 store order detail snapshot counter table + cache keys */
export const STORE_ORDER_DETAIL_SNAPSHOT_TABLE = "store_order_detail_snapshots";

export const STORE_ORDER_DETAIL_SNAPSHOT_RPC = "get_store_order_detail_snapshot";

export const STORE_ORDER_DETAIL_VIEWER_SCOPE_BUYER = "buyer";

export function storeOrderDetailSnapshotCounterTtlMs(): number {
  const raw = process.env.STORE_ORDER_DETAIL_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 8_000;
  if (!Number.isFinite(n) || n < 1_000) return 8_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}

export function storeOrderDetailSnapshotCacheKeyParts(input: {
  orderId: string;
  viewerUserId: string;
  scope?: string;
}): {
  order_id: string;
  viewer_user_id: string;
  viewer_scope: string;
} {
  return {
    order_id: input.orderId.trim(),
    viewer_user_id: input.viewerUserId.trim(),
    viewer_scope: (input.scope ?? STORE_ORDER_DETAIL_VIEWER_SCOPE_BUYER).trim() || STORE_ORDER_DETAIL_VIEWER_SCOPE_BUYER,
  };
}
