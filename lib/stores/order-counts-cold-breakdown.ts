/**
 * GET …/order-counts cold path — 관측 전용 (응답 JSON 불변).
 */

export type OrderCountsColdBreakdown = {
  ownership_check_ms: number;
  store_ops_meta_ms: number;
  rpc_wall_ms: number;
  rpc_parse_ms: number;
  cache_lookup_ms: number;
  cache_store_ms: number;
  order_counts_cold_parallel_wall_ms: number;
  order_counts_slowest_stage: string;
};

export function emptyOrderCountsColdBreakdown(): OrderCountsColdBreakdown {
  return {
    ownership_check_ms: 0,
    store_ops_meta_ms: 0,
    rpc_wall_ms: 0,
    rpc_parse_ms: 0,
    cache_lookup_ms: 0,
    cache_store_ms: 0,
    order_counts_cold_parallel_wall_ms: 0,
    order_counts_slowest_stage: "none",
  };
}

export function pickOrderCountsSlowestStage(b: OrderCountsColdBreakdown): string {
  const entries: Array<[string, number]> = [
    ["ownership_check", b.ownership_check_ms],
    ["store_ops_meta", b.store_ops_meta_ms],
    ["rpc_wall", b.rpc_wall_ms],
    ["rpc_parse", b.rpc_parse_ms],
    ["cache_lookup", b.cache_lookup_ms],
    ["cache_store", b.cache_store_ms],
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

export function logOrderCountsColdBreakdown(
  storeId: string,
  via: string,
  b: OrderCountsColdBreakdown
): void {
  if (process.env.NODE_ENV !== "development") return;
  const payload = {
    store_id: storeId,
    order_counts_via: via,
    ...b,
    order_counts_slowest_stage: pickOrderCountsSlowestStage(b),
  };
  // eslint-disable-next-line no-console -- order-counts cold breakdown (JSON line for measure)
  console.info(`[order-counts-cold-breakdown] ${JSON.stringify(payload)}`);
}
