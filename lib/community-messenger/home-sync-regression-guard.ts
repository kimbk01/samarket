/**
 * Home-sync regression guards — removed bottlenecks must not reappear on critical path.
 */
export type HomeSyncRegressionAlert = {
  transport_regression: 0 | 1;
  sequential_await_detected: 0 | 1;
  embed_join_detected: 0 | 1;
  aggregate_recompute_detected: 0 | 1;
  legacy_fallback_used: 0 | 1;
  stale_snapshot_detected: 0 | 1;
  alerts: string[];
};

export type HomeSyncSnapshotBreakdown = {
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  serialization_ms: number;
  payload_build_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  embed_join_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
  cache_hit_reason: string;
  rpc_removed: 0 | 1;
  snapshot_via?: "counter_row" | "unified_rpc" | "legacy_aggregate";
};

const FORBIDDEN_EMBED = /!\s*inner\s*\(/i;

export function detectForbiddenEmbedJoin(source: string): boolean {
  return FORBIDDEN_EMBED.test(source);
}

type GuardInput = {
  breakdown: HomeSyncSnapshotBreakdown;
  allowedRoundTrips?: number;
  snapshotVia?: "counter_row" | "unified_rpc" | "legacy_aggregate";
  staleSnapshot?: boolean;
};

export function evaluateHomeSyncRegressionGuards(input: GuardInput): HomeSyncRegressionAlert {
  const b = input.breakdown;
  const alerts: string[] = [];
  const allowed = input.allowedRoundTrips ?? 1;

  if ((b.query_wave_2_ms ?? 0) > 0 && input.snapshotVia !== "legacy_aggregate") {
    alerts.push(`query_wave_2_ms>${b.query_wave_2_ms}`);
  }
  if (b.round_trips > allowed && input.snapshotVia !== "legacy_aggregate") {
    alerts.push(`db_round_trips>${b.round_trips}`);
  }
  if (input.snapshotVia === "legacy_aggregate") {
    alerts.push("legacy_fallback_used");
  }
  if (b.sequential_await_detected) alerts.push("sequential_await_detected");
  if (b.embed_join_detected) alerts.push("embed_inner_join_detected");
  if (b.aggregate_compute_detected && input.snapshotVia === "legacy_aggregate") {
    alerts.push("aggregate_recompute_detected");
  }
  const transportRegression =
    input.snapshotVia === "legacy_aggregate" && b.db_ms > 80 ? 1 : 0;
  if (transportRegression) alerts.push("transport_regression");

  const alert: HomeSyncRegressionAlert = {
    transport_regression: transportRegression as 0 | 1,
    sequential_await_detected: b.sequential_await_detected,
    embed_join_detected: b.embed_join_detected,
    aggregate_recompute_detected: (input.snapshotVia === "legacy_aggregate" ? 1 : 0) as 0 | 1,
    legacy_fallback_used: (input.snapshotVia === "legacy_aggregate" ? 1 : 0) as 0 | 1,
    stale_snapshot_detected: (input.staleSnapshot ? 1 : 0) as 0 | 1,
    alerts,
  };

  if (alerts.length > 0) {
    // eslint-disable-next-line no-console -- regression guard
    console.warn("[home-sync-regression-alert]", { ...alert, breakdown: b, snapshotVia: input.snapshotVia });
  }
  return alert;
}
