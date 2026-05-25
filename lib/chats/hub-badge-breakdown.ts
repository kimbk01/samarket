/**
 * GET /api/me/store-owner-hub-badge — cold path stage breakdown (observability only).
 */
import { shortUserIdForPerf } from "@/lib/http/route-perf-dedupe-fields";
import type { FindOwnerHubStoreVia } from "@/lib/chats/find-owner-hub-store-perf";
import type { CmUnreadHubVia, StoreOrderUnreadHubVia } from "@/lib/chats/hub-badge-wave2-perf";

export type HubBadgeBreakdown = {
  total_ms: number;
  auth_ms?: number;
  find_hub_store_ms: number;
  unread_parts_ms: number;
  unread_parts_via?: "memory" | "counter" | "rpc" | "legacy" | "skipped_no_hub";
  /** find_hub_store_rows=0 — unread_parts·store_order unread RPC 생략 */
  no_hub_fast_path?: 0 | 1;
  unread_memory_hit?: 0 | 1;
  unread_memory_age_ms?: number;
  unread_counter_hit?: 0 | 1;
  unread_counter_age_ms?: number;
  unread_counter_refresh_ms?: number;
  unread_parts_rpc_ms?: number;
  find_hub_store_via?: FindOwnerHubStoreVia;
  find_hub_store_query_ms?: number;
  find_hub_store_permission_join_ms?: number;
  find_hub_store_rows?: number;
  find_hub_store_cache_hit?: 0 | 1;
  find_hub_store_cache_age_ms?: number;
  /** wave1 병렬 잔차 ≈ query_wave_1_ms - max(unread_parts_ms, find_hub_store_ms) */
  query_wave_1_parallel_slack_ms?: number;
  cm_unread_ms: number;
  cm_unread_via?: CmUnreadHubVia;
  cm_unread_rows?: number;
  cm_unread_query_ms?: number;
  cm_unread_rpc_ms?: number;
  cm_unread_legacy_ms?: number;
  cm_unread_memory_hit?: 0 | 1;
  cm_unread_memory_age_ms?: number;
  store_order_unread_ms: number;
  store_order_unread_via?: StoreOrderUnreadHubVia;
  store_order_unread_rows?: number;
  store_order_unread_query_ms?: number;
  store_order_unread_memory_hit?: 0 | 1;
  store_order_unread_memory_age_ms?: number;
  /** wave2 병렬 잔차 ≈ query_wave_2_ms - max(cm_unread_ms, store_order_unread_ms) */
  query_wave_2_parallel_slack_ms?: number;
  store_attention_total_ms: number;
  refund_pending_ms: number;
  order_pending_ms: number;
  inquiry_pending_ms: number;
  payload_build_ms: number;
  cache_hit: 0 | 1;
  cache_hit_reason?: string;
  user_id_short?: string;
  has_hub_store: 0 | 1;
  store_id_short?: string;
  query_wave_1_ms: number;
  query_wave_2_ms: number;
  query_wave_3_ms: number;
  worst_stage: string;
  worst_stage_ms: number;
  cm_unread_fallback?: 0 | 1;
  store_order_unread_fallback?: 0 | 1;
  find_hub_store_error?: 0 | 1;
  store_attention_via?: "memory" | "rpc" | "legacy";
  store_attention_memory_hit?: 0 | 1;
  store_attention_memory_age_ms?: number;
  store_attention_rpc_ms?: number;
  store_attention_legacy_ms?: number;
  /** hub-badge-cache-analysis */
  hub_store_memory_hit?: 0 | 1;
  unread_snapshot_hit?: 0 | 1;
  order_roomids_hit?: 0 | 1;
  transport_saved_ms?: number;
  rpc_removed?: 0 | 1;
  wave_parallelized?: 0 | 1;
};

let lastHubBadgeBreakdown: HubBadgeBreakdown | null = null;

export function peekLastHubBadgeBreakdown(): HubBadgeBreakdown | null {
  return lastHubBadgeBreakdown;
}

export function setLastHubBadgeBreakdown(b: HubBadgeBreakdown | null): void {
  lastHubBadgeBreakdown = b;
}

export function logHubBadgeBreakdown(b: HubBadgeBreakdown): void {
  setLastHubBadgeBreakdown(b);
  // eslint-disable-next-line no-console -- hub badge cold breakdown
  console.info("[hub-badge-breakdown]", b);
}

export type HubBadgeCacheAnalysis = {
  hub_store_memory_hit: 0 | 1;
  unread_snapshot_hit: 0 | 1;
  order_roomids_hit: 0 | 1;
  transport_saved_ms: number;
  rpc_removed: 0 | 1;
  wave_parallelized: 0 | 1;
};

export function logHubBadgeCacheAnalysis(a: HubBadgeCacheAnalysis): void {
  // eslint-disable-next-line no-console -- hub badge cache hit analysis
  console.info("[hub-badge-cache-analysis]", a);
}

export function storeIdShort(storeId: string | null | undefined): string {
  const s = (storeId ?? "").trim();
  if (!s) return "";
  return s.length <= 8 ? s : s.slice(0, 8);
}

type StageRow = { stage: string; ms: number };

export function pickWorstStage(stages: StageRow[]): { worst_stage: string; worst_stage_ms: number } {
  let worst: StageRow = { stage: "none", ms: 0 };
  for (const row of stages) {
    if (row.ms > worst.ms) worst = row;
  }
  return { worst_stage: worst.stage, worst_stage_ms: Math.round(worst.ms) };
}

export function hubBadgeBreakdownForUser(userId: string): Pick<HubBadgeBreakdown, "user_id_short"> {
  const short = shortUserIdForPerf(userId);
  return short ? { user_id_short: short } : {};
}
