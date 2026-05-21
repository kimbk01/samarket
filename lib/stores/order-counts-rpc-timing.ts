/**
 * order-counts cold RPC — PostgREST wall vs DB server SQL 분리 (관측 전용).
 * `rpc_wall_ms` = HTTP RTT + PostgREST + DB (클라이언트 벽시계).
 * `rpc_estimated_db_ms` = EXPLAIN/운영 기록값 (기본 5ms, env 로 덮어쓰기).
 */

import type { OrderCountsColdBreakdown } from "@/lib/stores/order-counts-cold-breakdown";

export const ORDER_COUNTS_RPC_DB_HINT_MS_DEFAULT = 5;

export function readOrderCountsRpcDbHintMs(): number {
  const raw = process.env.OWNER_DASHBOARD_RPC_SQL_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return ORDER_COUNTS_RPC_DB_HINT_MS_DEFAULT;
}

export type OrderCountsRpcTimingEnrichment = {
  rpc_estimated_db_ms: number;
  rpc_transport_estimated_ms: number;
  rpc_rtt_limited: boolean;
  rpc_db_internal_slow: boolean;
  cold_bottleneck_cause: string;
};

export function enrichOrderCountsRpcTiming(
  b: Pick<
    OrderCountsColdBreakdown,
    "rpc_wall_ms" | "rpc_parse_ms" | "auth_ms" | "ownership_ms" | "cache_set_ms" | "payload_build_ms"
  >
): OrderCountsRpcTimingEnrichment {
  const dbHint = readOrderCountsRpcDbHintMs();
  const transport = Math.max(0, Math.round(b.rpc_wall_ms - dbHint));
  const rpc_rtt_limited =
    b.rpc_wall_ms >= 150 && b.rpc_parse_ms < 15 && dbHint < 20 && transport >= b.rpc_wall_ms * 0.7;
  const rpc_db_internal_slow = dbHint >= 50 && dbHint > transport;

  let cold_bottleneck_cause = "none";
  const stages: Array<[string, number]> = [
    ["auth", b.auth_ms],
    ["ownership", b.ownership_ms],
    ["rpc_wall", b.rpc_wall_ms],
    ["rpc_parse", b.rpc_parse_ms],
    ["payload_build", b.payload_build_ms],
    ["cache_set", b.cache_set_ms],
  ];
  let bestMs = 0;
  for (const [name, ms] of stages) {
    if (ms > bestMs) {
      bestMs = ms;
      cold_bottleneck_cause = name;
    }
  }
  if (rpc_rtt_limited && b.rpc_wall_ms >= bestMs * 0.9) {
    cold_bottleneck_cause = "postgrest_rtt";
  }

  return {
    rpc_estimated_db_ms: dbHint,
    rpc_transport_estimated_ms: transport,
    rpc_rtt_limited,
    rpc_db_internal_slow,
    cold_bottleneck_cause,
  };
}
