/** CMB1 bootstrap snapshot counter table + cache keys */
export const CM_BOOTSTRAP_SNAPSHOT_TABLE = "community_messenger_bootstrap_snapshots";

export const CM_BOOTSTRAP_SNAPSHOT_RPC = "get_cm_bootstrap_critical_snapshot";

export const CM_BOOTSTRAP_LITE_DEFAULT_SCOPE = "lite_critical";

export const CM_BOOTSTRAP_LITE_DEFAULT_LIMIT = 500;

export function cmBootstrapSnapshotCounterTtlMs(): number {
  const raw = process.env.CM_BOOTSTRAP_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 8_000;
  if (!Number.isFinite(n) || n < 1_000) return 8_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}

export function cmBootstrapSnapshotCacheKeyParts(input: {
  userId: string;
  scope?: string;
  limit?: number;
  cursor?: string;
}): {
  user_id: string;
  bootstrap_scope: string;
  list_limit: number;
  cursor_key: string;
} {
  return {
    user_id: input.userId.trim(),
    bootstrap_scope: (input.scope ?? CM_BOOTSTRAP_LITE_DEFAULT_SCOPE).trim() || CM_BOOTSTRAP_LITE_DEFAULT_SCOPE,
    list_limit: Math.min(
      500,
      Math.max(1, Math.floor(input.limit ?? CM_BOOTSTRAP_LITE_DEFAULT_LIMIT))
    ),
    cursor_key: (input.cursor ?? "").trim(),
  };
}
