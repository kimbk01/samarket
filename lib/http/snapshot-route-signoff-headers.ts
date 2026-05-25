import type { SnapshotSignoffVia } from "@/lib/http/snapshot-signoff-response-headers";
import { buildSnapshotSignoffHeaders } from "@/lib/http/snapshot-signoff-response-headers";

export function storeMenusSnapshotSignoffHeaders(opts: {
  snapshotVia?: SnapshotSignoffVia | "counter_row";
  cacheHit?: boolean;
}): Record<string, string> {
  const rawVia = opts.snapshotVia;
  const normalizedVia: SnapshotSignoffVia | undefined =
    rawVia === "counter_row"
      ? "snapshot_row"
      : rawVia;
  const via = opts.cacheHit ? (normalizedVia ?? "route_memory_ttl") : normalizedVia;
  if (!via) return {};
  return buildSnapshotSignoffHeaders("store-menus", {
    snapshotPath: true,
    snapshotVia: via,
    queryWave2Ms: 0,
    rpcRemoved: 1,
    fallbackUsed: 0,
  });
}

export function roomBootstrapSnapshotSignoffHeaders(opts: {
  cacheHit: boolean;
  snapshotVia?: string;
  snapshotPath?: boolean;
}): Record<string, string> {
  const onSnapshotPath = opts.cacheHit || opts.snapshotPath === true;
  if (!onSnapshotPath) return {};
  const via: SnapshotSignoffVia = opts.cacheHit
    ? "route_memory_ttl"
    : opts.snapshotVia === "counter_row"
      ? "snapshot_row"
      : "unified_rpc";
  return buildSnapshotSignoffHeaders("room-bootstrap", {
    snapshotPath: true,
    snapshotVia: via,
    queryWave2Ms: 0,
    rpcRemoved: 1,
    fallbackUsed: 0,
  });
}
