/**
 * Structured hot-path analysis for store menus — structural bottleneck diagnosis.
 */
import type { StoreMenusSnapshotBreakdown } from "@/lib/stores/store-menus-regression-guard";

export type MenusHotpathAnalysis = {
  route: string;
  slug: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  products_fetch_ms: number;
  category_fetch_ms: number;
  popular_stats_ms: number;
  recommended_fetch_ms: number;
  options_fetch_ms: number;
  sort_compute_ms: number;
  image_hydration_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  rpc_removed: 0 | 1;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
  structural_note?: string;
};

export function logMenusHotpathAnalysis(
  breakdown: StoreMenusSnapshotBreakdown,
  opts?: { structuralNote?: string }
): void {
  const analysis: MenusHotpathAnalysis = {
    route: breakdown.route,
    slug: breakdown.slug,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    products_fetch_ms: breakdown.products_fetch_ms,
    category_fetch_ms: breakdown.category_fetch_ms,
    popular_stats_ms: breakdown.popular_stats_ms,
    recommended_fetch_ms: breakdown.recommended_fetch_ms,
    options_fetch_ms: breakdown.options_fetch_ms,
    sort_compute_ms: breakdown.sort_compute_ms,
    image_hydration_ms: breakdown.image_hydration_ms,
    cache_hit: breakdown.cache_hit,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    rpc_removed: breakdown.rpc_removed,
    sequential_await_detected: breakdown.sequential_await_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    repeated_join_detected: breakdown.repeated_join_detected,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
    structural_note: opts?.structuralNote,
  };
  // eslint-disable-next-line no-console -- required perf analysis output
  console.log("[menus-hotpath-analysis]", analysis);
}

let loggedDesign = false;

export function logStoreMenusSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- required design output
  console.log("[snapshot-rpc-design]", {
    route: "/api/stores/[slug]/menus",
    rpc_name: "get_store_menus_snapshot",
    expected_round_trips: 1,
    replaces_queries: [
      "stores slug gate",
      "store_products + store_menu_sections embed",
      "get_store_popular_product_stats",
      "loadStoreCommerceMeta (4 parallel counts)",
      "admin_settings commerce keys",
    ],
    snapshot_columns: ["payload_json", "store_slug", "viewer_user_id", "menu_version", "updated_at"],
    invalidation_events: [
      "product insert/update/delete",
      "stock/soldout change",
      "menu section CRUD",
      "review insert/update",
      "order checkout stock",
      "recommendation flags",
      "category reorder",
    ],
  });
}
