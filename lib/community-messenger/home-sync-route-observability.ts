import type { HomeSyncSnapshotBreakdown } from "@/lib/community-messenger/home-sync-regression-guard";
import type { SnapshotSignoffObs, SnapshotSignoffVia } from "@/lib/http/snapshot-signoff-response-headers";

let lastObs: SnapshotSignoffObs | null = null;

export function setLastHomeSyncRouteObservability(obs: SnapshotSignoffObs | null): void {
  lastObs = obs;
}

export function peekLastHomeSyncRouteObservability(): SnapshotSignoffObs | null {
  return lastObs;
}

function viaFromBreakdown(b: HomeSyncSnapshotBreakdown): SnapshotSignoffVia {
  if (b.snapshot_via === "counter_row" || b.cache_hit_reason.includes("snapshot_row")) {
    return "snapshot_row";
  }
  return "unified_rpc";
}

export function homeSyncObsFromBreakdown(b: HomeSyncSnapshotBreakdown): SnapshotSignoffObs {
  const snapshotPath = b.rpc_removed === 1;
  return {
    snapshotPath,
    snapshotVia: snapshotPath ? viaFromBreakdown(b) : undefined,
    queryWave2Ms: b.query_wave_2_ms ?? 0,
    rpcRemoved: snapshotPath ? 1 : 0,
    fallbackUsed: snapshotPath ? 0 : 1,
  };
}

export function homeSyncRouteMemoryTtlObs(): SnapshotSignoffObs {
  return {
    snapshotPath: true,
    snapshotVia: "route_memory_ttl",
    queryWave2Ms: 0,
    rpcRemoved: 1,
    fallbackUsed: 0,
  };
}

export function homeSyncLegacyFallbackObs(): SnapshotSignoffObs {
  return {
    snapshotPath: false,
    queryWave2Ms: 0,
    rpcRemoved: 0,
    fallbackUsed: 1,
  };
}
