/** CR1 chat rooms snapshot counter table + cache keys */
export const CHAT_ROOMS_SNAPSHOT_TABLE = "trade_chat_rooms_snapshots";

export const CHAT_ROOMS_SNAPSHOT_RPC = "get_chat_rooms_snapshot";

export const CHAT_ROOMS_SNAPSHOT_DEFAULT_SCOPE = "default";

export const CHAT_ROOMS_SNAPSHOT_DEFAULT_LIMIT = 200;

export function chatRoomsSnapshotCounterTtlMs(): number {
  const raw = process.env.CHAT_ROOMS_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 8_000;
  if (!Number.isFinite(n) || n < 1_000) return 8_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}

export function chatRoomsSnapshotCacheKeyParts(input: {
  userId: string;
  scope?: string;
  limit?: number;
  cursor?: string;
}): {
  user_id: string;
  list_scope: string;
  list_limit: number;
  cursor_key: string;
} {
  return {
    user_id: input.userId.trim(),
    list_scope: (input.scope ?? CHAT_ROOMS_SNAPSHOT_DEFAULT_SCOPE).trim() || CHAT_ROOMS_SNAPSHOT_DEFAULT_SCOPE,
    list_limit: Math.min(
      200,
      Math.max(1, Math.floor(input.limit ?? CHAT_ROOMS_SNAPSHOT_DEFAULT_LIMIT))
    ),
    cursor_key: (input.cursor ?? "").trim(),
  };
}
