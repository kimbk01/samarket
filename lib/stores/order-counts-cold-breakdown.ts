/**
 * GET …/order-counts cold path — 관측 전용 (응답 JSON 불변).
 */

import { isProdPerfLogEnabled } from "@/lib/performance/prod-same-region-perf";
import { enrichOrderCountsRpcTiming } from "@/lib/stores/order-counts-rpc-timing";

export type OrderCountsColdBreakdown = {
  auth_ms: number;
  ownership_ms: number;
  ownership_check_ms: number;
  store_ops_meta_ms: number;
  rpc_wall_ms: number;
  rpc_parse_ms: number;
  rpc_response_bytes: number;
  rpc_estimated_db_ms: number;
  rpc_transport_estimated_ms: number;
  rpc_rtt_limited: boolean;
  rpc_db_internal_slow: boolean;
  payload_build_ms: number;
  cache_lookup_ms: number;
  cache_set_ms: number;
  /** @deprecated use cache_set_ms */
  cache_store_ms: number;
  response_return_ms: number;
  order_counts_cold_parallel_wall_ms: number;
  order_counts_slowest_stage: string;
  cold_bottleneck_cause: string;
};

export function emptyOrderCountsColdBreakdown(): OrderCountsColdBreakdown {
  return {
    auth_ms: 0,
    ownership_ms: 0,
    ownership_check_ms: 0,
    store_ops_meta_ms: 0,
    rpc_wall_ms: 0,
    rpc_parse_ms: 0,
    rpc_response_bytes: 0,
    rpc_estimated_db_ms: 0,
    rpc_transport_estimated_ms: 0,
    rpc_rtt_limited: false,
    rpc_db_internal_slow: false,
    payload_build_ms: 0,
    cache_lookup_ms: 0,
    cache_set_ms: 0,
    cache_store_ms: 0,
    response_return_ms: 0,
    order_counts_cold_parallel_wall_ms: 0,
    order_counts_slowest_stage: "none",
    cold_bottleneck_cause: "none",
  };
}

export function pickOrderCountsSlowestStage(b: OrderCountsColdBreakdown): string {
  const entries: Array<[string, number]> = [
    ["auth", b.auth_ms],
    ["ownership", b.ownership_ms],
    ["ownership_check", b.ownership_check_ms],
    ["store_ops_meta", b.store_ops_meta_ms],
    ["rpc_wall", b.rpc_wall_ms],
    ["rpc_parse", b.rpc_parse_ms],
    ["payload_build", b.payload_build_ms],
    ["cache_lookup", b.cache_lookup_ms],
    ["cache_set", b.cache_set_ms],
  ];
  let best = "none";
  let ms = 0;
  for (const [stage, v] of entries) {
    if (v > ms) {
      ms = v;
      best = stage;
    }
  }
  return best;
}

export function finalizeOrderCountsColdBreakdown(b: OrderCountsColdBreakdown): OrderCountsColdBreakdown {
  b.cache_store_ms = b.cache_set_ms;
  const enriched = enrichOrderCountsRpcTiming(b);
  Object.assign(b, enriched);
  b.order_counts_slowest_stage = pickOrderCountsSlowestStage(b);
  return b;
}

export function logOrderCountsColdBreakdown(
  storeId: string,
  via: string,
  b: OrderCountsColdBreakdown
): void {
  if (!isProdPerfLogEnabled()) return;
  finalizeOrderCountsColdBreakdown(b);
  const payload = {
    store_id: storeId,
    order_counts_via: via,
    ...b,
    api_judgment_ms_field: "actual_handler_ms",
    cache_miss_returns_after_rpc: true,
  };
  // eslint-disable-next-line no-console -- order-counts cold breakdown (JSON line for measure)
  console.info(`[order-counts-cold-breakdown] ${JSON.stringify(payload)}`);
}
