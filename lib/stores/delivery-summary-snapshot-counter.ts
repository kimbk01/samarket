/**
 * Delivery summary snapshot counter keys + TTL.
 */
export const DELIVERY_SUMMARY_SNAPSHOT_TABLE = "delivery_summary_snapshots";

export const DELIVERY_SUMMARY_DEFAULT_SCOPE = "owner_dashboard";

export function deliverySummarySnapshotCounterTtlMs(): number {
  const raw = Number(process.env.DELIVERY_SUMMARY_SNAPSHOT_COUNTER_TTL_MS ?? 5000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

export function deliverySummarySnapshotCacheKeyParts(input: {
  storeId: string;
  ownerUserId: string;
  summaryScope?: string;
}): {
  store_id: string;
  owner_user_id: string;
  summary_scope: string;
} {
  return {
    store_id: input.storeId.trim(),
    owner_user_id: input.ownerUserId.trim(),
    summary_scope: (input.summaryScope ?? DELIVERY_SUMMARY_DEFAULT_SCOPE).trim() || DELIVERY_SUMMARY_DEFAULT_SCOPE,
  };
}
