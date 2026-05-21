/**
 * CM unread aggregate read-through — [cm-unread-aggregate-perf]
 */

export type CmUnreadAggregateVia = "counter_row" | "memory" | "rpc" | "legacy" | "skipped" | "hub_cache_observed";

export type CmUnreadAggregatePerfLog = {
  aggregate_hit: 0 | 1;
  aggregate_cache_hit: 0 | 1;
  aggregate_singleflight_hit: 0 | 1;
  aggregate_rpc_ms: number;
  aggregate_db_round_trips: number;
  aggregate_payload_ms: number;
  aggregate_total_ms: number;
  aggregate_staleness_ms: number;
  aggregate_via: CmUnreadAggregateVia;
  /** hub-badge 전체 TTL hit 시 CM 레이어 관측 (집계 로직 불변) */
  hub_badge_route_cache_hit?: 0 | 1;
  cm_unread_via?: CmUnreadAggregateVia;
  aggregate_counter_row_hit?: 0 | 1;
  aggregate_counter_upserted?: 0 | 1;
};

export function emptyCmUnreadAggregatePerf(): CmUnreadAggregatePerfLog {
  return {
    aggregate_hit: 0,
    aggregate_cache_hit: 0,
    aggregate_singleflight_hit: 0,
    aggregate_rpc_ms: 0,
    aggregate_db_round_trips: 0,
    aggregate_payload_ms: 0,
    aggregate_total_ms: 0,
    aggregate_staleness_ms: 0,
    aggregate_via: "skipped",
    hub_badge_route_cache_hit: 0,
    cm_unread_via: "skipped",
    aggregate_counter_row_hit: 0,
    aggregate_counter_upserted: 0,
  };
}

export function logCmUnreadAggregatePerf(row: CmUnreadAggregatePerfLog): void {
  if (process.env.NODE_ENV !== "development") return;
  const payload: CmUnreadAggregatePerfLog = {
    ...row,
    cm_unread_via: row.cm_unread_via ?? row.aggregate_via,
  };
  // eslint-disable-next-line no-console
  console.info("[cm-unread-aggregate-perf]", JSON.stringify(payload));
}
