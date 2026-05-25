import type { SnapshotSignoffObs, SnapshotSignoffVia } from "@/lib/http/snapshot-signoff-response-headers";

export type DeliverySummaryOrderCountsVia =
  | "delivery_summary_snapshot"
  | "rpc_snapshot"
  | "rpc"
  | "legacy";

function viaToSignoffVia(via: DeliverySummaryOrderCountsVia, cacheHit: boolean): SnapshotSignoffVia | undefined {
  if (cacheHit) return "route_memory_ttl";
  if (via === "delivery_summary_snapshot" || via === "rpc_snapshot") return "unified_rpc";
  return undefined;
}

export function deliverySummarySignoffObs(
  via: DeliverySummaryOrderCountsVia,
  cacheHit: boolean
): SnapshotSignoffObs {
  const snapshotPath = via !== "legacy";
  return {
    snapshotPath,
    snapshotVia: snapshotPath ? viaToSignoffVia(via, cacheHit) : undefined,
    queryWave2Ms: 0,
    rpcRemoved: snapshotPath ? 1 : 0,
    fallbackUsed: snapshotPath ? 0 : 1,
  };
}
