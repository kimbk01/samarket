/**
 * Owner dashboard notifications snapshot counter keys + TTL.
 */
export const OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_TABLE = "owner_dashboard_notifications_snapshots";

export const OWNER_DASHBOARD_NOTIFICATIONS_ANON_STORE_ID =
  "00000000-0000-0000-0000-000000000000";

export function ownerDashboardNotificationsSnapshotCounterTtlMs(): number {
  const raw = Number(process.env.OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_COUNTER_TTL_MS ?? 5000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

export function ownerDashboardNotificationsSnapshotCacheKeyParts(input: {
  userId: string;
  storeId: string | null;
  snapshotKind: string;
  limit: number;
  cursor?: string;
}): {
  user_id: string;
  store_id: string;
  snapshot_kind: string;
  limit_n: number;
  cursor_token: string;
} {
  return {
    user_id: input.userId.trim(),
    store_id: input.storeId?.trim() || OWNER_DASHBOARD_NOTIFICATIONS_ANON_STORE_ID,
    snapshot_kind: input.snapshotKind.trim() || "owner_store",
    limit_n: Math.max(1, Math.floor(input.limit) || 200),
    cursor_token: (input.cursor ?? "").trim(),
  };
}
