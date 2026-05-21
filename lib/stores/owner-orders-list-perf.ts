/**
 * GET owner store orders list — [owner-orders-list-perf]
 */

export type OwnerOrdersListPerfLog = {
  rpc_ms: number;
  transform_ms: number;
  payload_kb: number;
  normalize_ms: number;
  attach_ms: number;
  serialization_ms: number;
  list_snapshot_hit: 0 | 1;
  list_snapshot_singleflight_hit: 0 | 1;
  detail_fields_removed: 0 | 1;
  db_round_trips: number;
  buyer_label_cache_hit: 0 | 1;
  total_ms: number;
  route?: string;
};

export function logOwnerOrdersListPerf(row: OwnerOrdersListPerfLog): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console
  console.info("[owner-orders-list-perf]", JSON.stringify(row));
}
