/**
 * GET /api/me/store-owner-hub-badge — owner_hub_badge_snapshot_row 내부 단계 분해 (관측 전용).
 */

export type HubBadgeDeepBreakdownPath =
  | "counter_row"
  | "counter_row_stale_swr"
  | "unified_rpc"
  | "route_ttl_hit"
  | "unknown";

export type HubBadgeDeepBreakdown = {
  path: HubBadgeDeepBreakdownPath;
  db_fetch_ms: number;
  snapshot_deserialize_ms: number;
  /** counter row: CPU from row fields. unified_rpc: opaque (aggregate inside RPC). */
  aggregate_compute_ms: number;
  participant_merge_ms: number;
  payload_build_ms: number;
  json_serialize_ms: number;
  transport_ms: number;
  cache_lookup_ms: number;
  cache_store_ms: number;
  memory_snapshot_hit: 0 | 1;
  query_row_bytes: number;
  response_bytes: number;
  snapshot_json_bytes: number;
  cm_unread_room_count: number;
  participant_unread_total: number;
  aggregate_inside_rpc?: 0 | 1;
  stale?: 0 | 1;
  total_ms?: number;
  explain_ran?: 0 | 1;
};

let lastHubBadgeDeepBreakdown: HubBadgeDeepBreakdown | null = null;

export function peekLastHubBadgeDeepBreakdown(): HubBadgeDeepBreakdown | null {
  return lastHubBadgeDeepBreakdown;
}

export function setLastHubBadgeDeepBreakdown(b: HubBadgeDeepBreakdown | null): void {
  lastHubBadgeDeepBreakdown = b;
}

export function measureJsonUtf8Bytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

export function isHubBadgeExplainTraceEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_TRACE_HUB_BADGE_EXPLAIN === "1"
  );
}

/** dev + flag — EXPLAIN 은 request path 비블로킹 힌트만 (실행: scripts/explain-hub-badge-counter.mjs). */
export function scheduleHubBadgeCounterExplainIfEnabled(userId: string): void {
  if (!isHubBadgeExplainTraceEnabled()) return;
  const uid = userId.trim();
  if (!uid) return;
  // eslint-disable-next-line no-console -- dev explain pointer
  console.info("[hub-badge-explain]", {
    explain_ran: 0,
    reason: "use_explain_script",
    user_id_short: uid.slice(0, 8),
    hint: `node scripts/explain-hub-badge-counter.mjs ${uid}`,
  });
}

export function logHubBadgeDeepBreakdown(b: HubBadgeDeepBreakdown): void {
  setLastHubBadgeDeepBreakdown(b);
  // eslint-disable-next-line no-console -- hub badge deep stage breakdown
  console.info("[hub-badge-deep-breakdown]", b);
}

export function mergeRouteHubBadgeDeepBreakdown(
  snapshot: HubBadgeDeepBreakdown | null,
  route: {
    path?: HubBadgeDeepBreakdownPath;
    cache_lookup_ms: number;
    cache_store_ms: number;
    json_serialize_ms: number;
    transport_ms: number;
    response_bytes: number;
    total_ms: number;
    memory_snapshot_hit?: 0 | 1;
  }
): HubBadgeDeepBreakdown {
  const base: HubBadgeDeepBreakdown = snapshot ?? {
    path: route.path ?? "unknown",
    db_fetch_ms: 0,
    snapshot_deserialize_ms: 0,
    aggregate_compute_ms: 0,
    participant_merge_ms: 0,
    payload_build_ms: 0,
    json_serialize_ms: 0,
    transport_ms: 0,
    cache_lookup_ms: 0,
    cache_store_ms: 0,
    memory_snapshot_hit: 0,
    query_row_bytes: 0,
    response_bytes: 0,
    snapshot_json_bytes: 0,
    cm_unread_room_count: 0,
    participant_unread_total: 0,
  };
  return {
    ...base,
    path: route.path ?? base.path,
    cache_lookup_ms: route.cache_lookup_ms,
    cache_store_ms: route.cache_store_ms,
    json_serialize_ms: route.json_serialize_ms,
    transport_ms: route.transport_ms,
    response_bytes: route.response_bytes,
    total_ms: route.total_ms,
    memory_snapshot_hit: route.memory_snapshot_hit ?? base.memory_snapshot_hit,
  };
}
