/**
 * SB1 stores browse monolith hotpath analysis.
 */
import type { StoresBrowseSnapshotBreakdown } from "@/lib/stores/stores-browse-snapshot-regression-guard";

export type StoresBrowseMonolithAnalysis = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  stores_fetch_ms: number;
  category_join_ms: number;
  review_merge_ms: number;
  rating_merge_ms: number;
  delivery_meta_merge_ms: number;
  recommendation_merge_ms: number;
  search_filter_compute_ms: number;
  ordering_compute_ms: number;
  availability_check_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  fallback_used: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
};

export function logStoresBrowseMonolithAnalysis(
  breakdown: StoresBrowseSnapshotBreakdown
): void {
  const analysis: StoresBrowseMonolithAnalysis = {
    route: breakdown.route,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    stores_fetch_ms: breakdown.stores_fetch_ms,
    category_join_ms: breakdown.category_join_ms,
    review_merge_ms: breakdown.review_merge_ms,
    rating_merge_ms: breakdown.rating_merge_ms,
    delivery_meta_merge_ms: breakdown.delivery_meta_merge_ms,
    recommendation_merge_ms: breakdown.recommendation_merge_ms,
    search_filter_compute_ms: breakdown.search_filter_compute_ms,
    ordering_compute_ms: breakdown.ordering_compute_ms,
    availability_check_ms: breakdown.availability_check_ms,
    cache_hit: breakdown.cache_hit,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    sequential_await_detected: breakdown.sequential_await_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    repeated_join_detected: breakdown.repeated_join_detected,
    fallback_used: breakdown.fallback_used,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
  };
  // eslint-disable-next-line no-console -- SB1 required output
  console.log("[stores-browse-monolith-analysis]", analysis);
}

let loggedDesign = false;

export function logStoresBrowseSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- SB1 design reference
  console.log("[stores-browse-snapshot-rpc-design]", {
    route: "/api/stores/browse",
    rpc_name: "get_stores_browse_snapshot",
    expected_round_trips: 1,
    invalidation_events: [
      "store_create",
      "store_update",
      "category_update",
      "rating_review_insert",
      "delivery_state_update",
      "store_open_close",
      "recommendation_change",
      "menu_update",
      "soldout_change",
      "eta_change",
    ],
  });
}
