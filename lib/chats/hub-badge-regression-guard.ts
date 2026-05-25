/**
 * Hub badge regression guards — removed bottlenecks must not reappear.
 * Dev: console.warn. All envs: [hub-badge-regression-alert] structured log.
 */
import type { HubBadgeBreakdown } from "@/lib/chats/hub-badge-breakdown";

export type HubBadgeRegressionAlert = {
  transport_regression: 0 | 1;
  sequential_wave_detected: 0 | 1;
  duplicate_rpc_detected: 0 | 1;
  aggregate_recompute_detected: 0 | 1;
  snapshot_miss_reason?: string;
  invalidation_gap_ms?: number;
  stale_snapshot_detected: 0 | 1;
  realtime_desync_detected: 0 | 1;
  /** guard detail codes */
  alerts: string[];
};

const FORBIDDEN_EMBED_INNER = /store_sales_permissions!inner/;

export function detectForbiddenEmbedInnerJoin(source: string): boolean {
  return FORBIDDEN_EMBED_INNER.test(source);
}

export function warnForbiddenEmbedInnerJoin(context: string): void {
  if (!detectForbiddenEmbedInnerJoin(context)) return;
  // eslint-disable-next-line no-console -- regression guard
  console.warn("[hub-badge-regression-guard] forbidden embed inner join detected", { context });
}

type GuardInput = {
  breakdown: HubBadgeBreakdown;
  dbRoundTrips?: number;
  snapshotVia?: "counter_row" | "unified_rpc" | "legacy_aggregate" | "memory_layers";
  duplicateAggregate?: boolean;
  staleSnapshot?: boolean;
  snapshotMissReason?: string;
};

export function evaluateHubBadgeRegressionGuards(input: GuardInput): HubBadgeRegressionAlert {
  const b = input.breakdown;
  const alerts: string[] = [];

  if (b.find_hub_store_ms > 30 && b.find_hub_store_cache_hit !== 1) {
    alerts.push(`find_hub_store_ms>${b.find_hub_store_ms}`);
  }
  if ((b.cm_unread_rpc_ms ?? 0) > 80 || (b.cm_unread_ms > 80 && b.cm_unread_memory_hit !== 1)) {
    alerts.push(`cm_unread_ms>${b.cm_unread_ms}`);
  }
  if (b.store_order_unread_ms > 80 && b.store_order_unread_memory_hit !== 1) {
    alerts.push(`store_order_unread_ms>${b.store_order_unread_ms}`);
  }
  if ((b.query_wave_2_ms ?? 0) > 0) {
    alerts.push(`query_wave_2_ms>${b.query_wave_2_ms}`);
  }
  if ((input.dbRoundTrips ?? 99) > 2 && input.snapshotVia === "legacy_aggregate") {
    alerts.push(`db_round_trips>${input.dbRoundTrips}`);
  }
  if (input.duplicateAggregate) {
    alerts.push("duplicate_aggregate");
  }
  const transportRegression =
    input.snapshotVia === "legacy_aggregate" &&
    (b.cm_unread_ms > 80 || b.find_hub_store_ms > 30 || b.store_order_unread_ms > 80)
      ? 1
      : 0;
  if (transportRegression) alerts.push("transport_regression");

  const sequentialWave =
    (b.query_wave_1_parallel_slack_ms ?? 0) > 50 || (b.query_wave_2_parallel_slack_ms ?? 0) > 0
      ? 1
      : 0;
  if (sequentialWave) alerts.push("sequential_wave");

  const alert: HubBadgeRegressionAlert = {
    transport_regression: transportRegression as 0 | 1,
    sequential_wave_detected: sequentialWave as 0 | 1,
    duplicate_rpc_detected: (input.duplicateAggregate ? 1 : 0) as 0 | 1,
    aggregate_recompute_detected: (input.snapshotVia === "legacy_aggregate" ? 1 : 0) as 0 | 1,
    ...(input.snapshotMissReason ? { snapshot_miss_reason: input.snapshotMissReason } : {}),
    stale_snapshot_detected: (input.staleSnapshot ? 1 : 0) as 0 | 1,
    realtime_desync_detected: 0,
    alerts,
  };

  if (alerts.length > 0) {
    // eslint-disable-next-line no-console -- regression alert (required observability)
    console.warn("[hub-badge-regression-alert]", alert);
  }

  return alert;
}
