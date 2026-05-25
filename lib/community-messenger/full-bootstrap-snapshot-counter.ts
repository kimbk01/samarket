/** FBT1 full bootstrap snapshot counter keys */
export const FBT1_BOOTSTRAP_SNAPSHOT_TABLE = "community_messenger_bootstrap_snapshots";
export const FBT1_BOOTSTRAP_SNAPSHOT_RPC = "get_cm_bootstrap_full_snapshot";
export const FBT1_FULL_DEFAULT_SCOPE = "full_monolith";
export const FBT1_CRITICAL_DEFAULT_SCOPE = "critical_tier";
export const FBT1_FULL_DEFAULT_LIMIT = 500;
export const FBT1_CRITICAL_DEFAULT_LIMIT = 30;

export function fbt1BootstrapSnapshotCounterTtlMs(): number {
  const raw = process.env.FBT1_BOOTSTRAP_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 8_000;
  if (!Number.isFinite(n) || n < 1_000) return 8_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}

export function fbt1BootstrapSnapshotCacheKeyParts(input: {
  userId: string;
  tier: "full" | "critical";
  limit?: number;
  cursor?: string;
}): {
  user_id: string;
  bootstrap_scope: string;
  list_limit: number;
  cursor_key: string;
} {
  const tier = input.tier === "critical" ? "critical" : "full";
  return {
    user_id: input.userId.trim(),
    bootstrap_scope: tier === "critical" ? FBT1_CRITICAL_DEFAULT_SCOPE : FBT1_FULL_DEFAULT_SCOPE,
    list_limit:
      tier === "critical"
        ? Math.min(30, Math.max(1, Math.floor(input.limit ?? FBT1_CRITICAL_DEFAULT_LIMIT)))
        : Math.min(500, Math.max(1, Math.floor(input.limit ?? FBT1_FULL_DEFAULT_LIMIT))),
    cursor_key: (input.cursor ?? "").trim(),
  };
}
