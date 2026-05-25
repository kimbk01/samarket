/** DB snapshot row TTL — home-sync route TTL(5s)와 맞춤 */
export const CM_HOME_SYNC_SNAPSHOT_TABLE = "community_messenger_home_sync_snapshots";

export function homeSyncSnapshotCounterTtlMs(): number {
  const raw = process.env.CM_HOME_SYNC_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 5_000;
  if (!Number.isFinite(n) || n < 1_000) return 5_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}
