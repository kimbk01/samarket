export const CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE = "community_messenger_room_bootstrap_snapshots";

export function roomBootstrapSnapshotCounterTtlMs(): number {
  const raw = process.env.CM_ROOM_BOOTSTRAP_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 5_000;
  if (!Number.isFinite(n) || n < 1_000) return 5_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}

export function roomBootstrapSnapshotCacheKeyParts(
  userId: string,
  roomId: string,
  snapshotTier: string,
  messageLimit: number
): { user_id: string; room_id: string; snapshot_tier: string; message_limit: number } {
  return {
    user_id: userId.trim(),
    room_id: roomId.trim(),
    snapshot_tier: snapshotTier.trim() || "critical",
    message_limit: Math.max(1, Math.floor(messageLimit) || 24),
  };
}
