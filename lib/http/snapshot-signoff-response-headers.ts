/**
 * Prod OPS1-B / PDS1 snapshot observability headers — response headers only, no body change.
 */

export type SnapshotSignoffVia = "snapshot_row" | "unified_rpc" | "route_memory_ttl";

export type SnapshotSignoffObs = {
  snapshotPath: boolean;
  snapshotVia?: SnapshotSignoffVia;
  queryWave2Ms: number;
  rpcRemoved: 0 | 1;
  fallbackUsed: 0 | 1;
  authBlocked?: 0 | 1;
};

export function buildSnapshotSignoffHeaders(
  prefix: string,
  obs: SnapshotSignoffObs
): Record<string, string> {
  if (obs.authBlocked === 1) {
    return { [`x-samarket-${prefix}-auth-blocked`]: "1" };
  }
  if (!obs.snapshotPath) {
    return obs.fallbackUsed === 1 ? { [`x-samarket-${prefix}-fallback-used`]: "1" } : {};
  }
  return {
    [`x-samarket-${prefix}-snapshot-path`]: "1",
    [`x-samarket-${prefix}-snapshot-via`]: obs.snapshotVia ?? "unified_rpc",
    [`x-samarket-${prefix}-query-wave-2-ms`]: String(obs.queryWave2Ms),
    [`x-samarket-${prefix}-rpc-removed`]: String(obs.rpcRemoved),
    [`x-samarket-${prefix}-fallback-used`]: "0",
  };
}
