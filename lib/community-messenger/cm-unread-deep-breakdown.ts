/**
 * Hub badge cm_unread — DB vs PostgREST transport vs parse 분리 (관측 전용).
 * `[cm-unread-deep-breakdown]` — unread 방 개수 의미 불변.
 */
import type { HubBadgeCmUnreadTiming } from "@/lib/chats/hub-badge-wave2-perf";
import { isProdPerfLogEnabled } from "@/lib/performance/prod-same-region-perf";

export type CmUnreadDeepBreakdown = {
  query_start_ms: number;
  query_done_ms: number;
  db_execution_ms: number;
  transport_ms: number;
  postgrest_wall_ms: number;
  payload_bytes: number;
  room_count: number;
  unread_message_count: number;
  unread_room_count: number;
  participant_join_ms: number;
  profile_join_ms: number;
  aggregation_ms: number;
  rls_ms: number;
  serialization_ms: number;
  response_parse_ms: number;
  cache_lookup_ms: number;
  cache_set_ms: number;
  cache_set_upsert_deferred: 0 | 1;
  cold_or_warm: "cold" | "warm";
  cache_hit: 0 | 1;
  actual_handler_ms: number | null;
  cm_unread_via: string;
  cold_bottleneck_cause: string;
  api_judgment_ms_field: "actual_handler_ms";
};

const DB_HINT_MS_DEFAULT = 5;

export function readCmUnreadRpcDbHintMs(): number {
  const raw = process.env.CM_UNREAD_RPC_DB_HINT_MS?.trim() ?? process.env.OWNER_DASHBOARD_RPC_SQL_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return DB_HINT_MS_DEFAULT;
}

export function estimateTransportMs(postgrestWallMs: number, dbHintMs?: number): {
  db_execution_ms: number;
  transport_ms: number;
} {
  const db = dbHintMs ?? readCmUnreadRpcDbHintMs();
  const wall = Math.max(0, Math.round(postgrestWallMs));
  const transport = Math.max(0, wall - db);
  return { db_execution_ms: db, transport_ms: transport };
}

export function buildCmUnreadDeepBreakdown(input: {
  mountMs: number;
  totalMs: number;
  cacheLookupMs: number;
  cacheSetMs: number;
  cacheSetUpsertDeferred?: boolean;
  postgrestWallMs: number;
  responseParseMs: number;
  aggregationMs: number;
  payloadBytes: number;
  unreadRoomCount: number;
  via: string;
  cacheHit: boolean;
  actualHandlerMs?: number | null;
  timing?: HubBadgeCmUnreadTiming | null;
}): CmUnreadDeepBreakdown {
  const { db_execution_ms, transport_ms } = estimateTransportMs(input.postgrestWallMs);
  const cold_or_warm: "cold" | "warm" = input.cacheHit ? "warm" : "cold";

  let cold_bottleneck_cause = "none";
  if (input.via === "memory" || input.cacheHit) {
    cold_bottleneck_cause = "memory_ttl";
  } else if (transport_ms >= db_execution_ms * 3 && input.postgrestWallMs >= 80) {
    cold_bottleneck_cause = "postgrest_transport";
  } else if (input.via === "rpc" || input.via === "postgrest_count_head") {
    cold_bottleneck_cause = input.via === "rpc" ? "rpc_wall" : "legacy_count_head";
  } else if (input.via === "aggregate" || input.via === "counter_row") {
    cold_bottleneck_cause = "counter_row_read";
  } else if (input.cacheSetMs > 20 && !input.cacheSetUpsertDeferred) {
    cold_bottleneck_cause = "sync_cache_upsert";
  }

  return {
    query_start_ms: Math.round(input.mountMs),
    query_done_ms: Math.round(input.mountMs + input.totalMs),
    db_execution_ms,
    transport_ms,
    postgrest_wall_ms: Math.round(input.postgrestWallMs),
    payload_bytes: input.payloadBytes,
    room_count: input.unreadRoomCount,
    unread_message_count: 0,
    unread_room_count: input.unreadRoomCount,
    participant_join_ms: 0,
    profile_join_ms: 0,
    aggregation_ms: Math.round(input.aggregationMs),
    rls_ms: 0,
    serialization_ms: 0,
    response_parse_ms: Math.round(input.responseParseMs),
    cache_lookup_ms: Math.round(input.cacheLookupMs),
    cache_set_ms: Math.round(input.cacheSetMs),
    cache_set_upsert_deferred: input.cacheSetUpsertDeferred ? 1 : 0,
    cold_or_warm,
    cache_hit: input.cacheHit ? 1 : 0,
    actual_handler_ms: input.actualHandlerMs ?? null,
    cm_unread_via: input.via,
    cold_bottleneck_cause,
    api_judgment_ms_field: "actual_handler_ms",
  };
}

export function logCmUnreadDeepBreakdown(row: CmUnreadDeepBreakdown): void {
  if (!isProdPerfLogEnabled()) return;
  // eslint-disable-next-line no-console -- cm unread deep breakdown (round D)
  console.info(`[cm-unread-deep-breakdown] ${JSON.stringify(row)}`);
}
