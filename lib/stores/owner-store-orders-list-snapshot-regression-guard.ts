/**
 * OOL1 owner orders list regression guards.
 */
import type { OwnerOrdersListHotpathAnalysis } from "@/lib/stores/owner-store-orders-list-snapshot-hotpath-analysis";

export type OwnerStoreOrdersListSnapshotBreakdown = {
  route: string;
  store_id?: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  orders_fetch_ms: number;
  customer_profile_join_ms: number;
  order_items_summary_ms: number;
  delivery_status_merge_ms: number;
  payment_status_merge_ms: number;
  chat_unread_merge_ms: number;
  status_filter_ms: number;
  sort_compute_ms: number;
  ownership_check_ms?: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  fallback_used: 0 | 1;
  rpc_removed: 0 | 1;
  snapshot_via?: string;
  worst_stage: string;
  worst_stage_ms: number;
};

export type OwnerOrdersListRegressionAlert = {
  query_wave_2_detected: 0 | 1;
  excessive_round_trips: 0 | 1;
  transport_regression: 0 | 1;
  aggregate_recompute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  legacy_fallback_used: 0 | 1;
  sequential_await_detected: 0 | 1;
  alerts: string[];
};

export function evaluateOwnerOrdersListRegressionGuards(
  row: OwnerStoreOrdersListSnapshotBreakdown
): OwnerOrdersListRegressionAlert {
  const alerts: string[] = [];
  if (row.query_wave_2_ms > 0) alerts.push("query_wave_2_ms_gt_0");
  if (row.round_trips > 2) alerts.push("db_round_trips_gt_2");
  if (row.transport_ms > 400 && row.cache_hit === 0) alerts.push("transport_ms_regression");
  if (row.aggregate_compute_detected) alerts.push("aggregate_recompute_detected");
  if (row.repeated_join_detected) alerts.push("repeated_order_profile_item_join");
  if (row.fallback_used) alerts.push("legacy_fallback_used");
  if (row.sequential_await_detected) alerts.push("sequential_await_detected");

  const alert: OwnerOrdersListRegressionAlert = {
    query_wave_2_detected: row.query_wave_2_ms > 0 ? 1 : 0,
    excessive_round_trips: row.round_trips > 2 ? 1 : 0,
    transport_regression: row.transport_ms > 400 && row.cache_hit === 0 ? 1 : 0,
    aggregate_recompute_detected: row.aggregate_compute_detected,
    repeated_join_detected: row.repeated_join_detected,
    legacy_fallback_used: row.fallback_used,
    sequential_await_detected: row.sequential_await_detected,
    alerts,
  };

  if (alerts.length > 0) {
    // eslint-disable-next-line no-console -- regression guard
    console.warn("[owner-orders-list-regression-alert]", { ...alert, breakdown: row });
  }
  return alert;
}

export function breakdownToHotpathFields(
  b: OwnerStoreOrdersListSnapshotBreakdown
): OwnerOrdersListHotpathAnalysis {
  return {
    route: b.route,
    store_id: b.store_id ?? "",
    total_ms: b.total_ms,
    db_ms: b.db_ms,
    round_trips: b.round_trips,
    transport_ms: b.transport_ms,
    payload_build_ms: b.payload_build_ms,
    orders_fetch_ms: b.orders_fetch_ms,
    customer_profile_join_ms: b.customer_profile_join_ms,
    order_items_summary_ms: b.order_items_summary_ms,
    delivery_status_merge_ms: b.delivery_status_merge_ms,
    payment_status_merge_ms: b.payment_status_merge_ms,
    chat_unread_merge_ms: b.chat_unread_merge_ms,
    status_filter_ms: b.status_filter_ms,
    sort_compute_ms: b.sort_compute_ms,
    ownership_check_ms: b.ownership_check_ms ?? 0,
    cache_hit: b.cache_hit,
    wave_count: b.wave_count,
    query_wave_2_ms: b.query_wave_2_ms,
    sequential_await_detected: b.sequential_await_detected,
    aggregate_compute_detected: b.aggregate_compute_detected,
    repeated_join_detected: b.repeated_join_detected,
    fallback_used: b.fallback_used,
    worst_stage: b.worst_stage,
    worst_stage_ms: b.worst_stage_ms,
  };
}
