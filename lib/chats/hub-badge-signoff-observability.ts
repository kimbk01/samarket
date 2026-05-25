import type { HubBadgeBreakdown } from "@/lib/chats/hub-badge-breakdown";
import type { SnapshotSignoffObs } from "@/lib/http/snapshot-signoff-response-headers";

const SNAPSHOT_REASONS = new Set(["owner_hub_badge_snapshot_row", "owner_hub_badge_unified_rpc"]);

/** Hub badge route — snapshot path observability from breakdown / route TTL hit. */
export function hubBadgeSignoffObs(
  breakdown: HubBadgeBreakdown | null,
  ttlCacheHit: boolean
): SnapshotSignoffObs {
  if (ttlCacheHit) {
    return {
      snapshotPath: true,
      snapshotVia: "route_memory_ttl",
      queryWave2Ms: 0,
      rpcRemoved: 1,
      fallbackUsed: 0,
    };
  }
  const reason = breakdown?.cache_hit_reason ?? "";
  if (SNAPSHOT_REASONS.has(reason)) {
    return {
      snapshotPath: true,
      snapshotVia: reason === "owner_hub_badge_snapshot_row" ? "snapshot_row" : "unified_rpc",
      queryWave2Ms: breakdown?.query_wave_2_ms ?? 0,
      rpcRemoved: 1,
      fallbackUsed: 0,
    };
  }
  return {
    snapshotPath: false,
    queryWave2Ms: breakdown?.query_wave_2_ms ?? 0,
    rpcRemoved: breakdown?.rpc_removed ?? 0,
    fallbackUsed: 1,
  };
}
