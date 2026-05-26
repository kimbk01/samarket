/**
 * 디바이(C2C) 거래·채팅 최종 점검용 표준 계측 키.
 * 기본 오프 — `samarket:debug:runtime=1` 또는 `NEXT_PUBLIC_SAMARKET_PERF_LOG=1` 일 때만 기록.
 * 프로덕션 부하는 `logClientPerf` 게이트와 동일(추가 JSON 직렬화 없음).
 */
import { logClientPerf, isClientPerfLogEnabled } from "@/lib/performance/samarket-perf";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
  samarketRuntimeDebugEnabled,
} from "@/lib/runtime/samarket-runtime-debug";

export type TradeC2CPerfMetricKey =
  | "trade_list_total_ms"
  | "trade_list_db_ms"
  | "trade_list_payload_bytes"
  | "trade_detail_total_ms"
  | "trade_chat_open_total_ms"
  | "trade_chat_bootstrap_ms"
  | "trade_chat_resolve_ms"
  | "trade_chat_redirect_ms"
  | "chat_click_to_compose_route_ms"
  | "compose_route_to_resolve_fetch_start_ms"
  | "trade_chat_resolve_fetch_ms"
  | "resolve_done_to_router_replace_ms"
  | "router_replace_to_room_url_ms"
  | "room_url_to_rsc_ready_ms"
  | "room_rsc_to_bootstrap_fetch_start_ms"
  | "cm_room_bootstrap_total_ms"
  | "room_bootstrap_to_shell_ready_ms"
  | "room_bootstrap_done_to_shell_mount_ms"
  | "room_shell_mount_to_first_message_ready_ms"
  | "room_shell_mount_to_header_ready_ms"
  | "room_shell_mount_to_realtime_ready_ms"
  | "room_shell_mount_to_presence_ready_ms"
  | "room_shell_mount_to_read_effect_ready_ms"
  | "room_shell_mount_to_snapshot_ready_ms"
  | "room_initial_message_count"
  | "room_initial_render_blocking_task_ms"
  | "phase1_total_ms"
  | "phase1_bootstrap_normalize_ms"
  | "phase1_messages_normalize_ms"
  | "phase1_participants_normalize_ms"
  | "phase1_store_hydration_ms"
  | "phase1_read_state_init_ms"
  | "phase1_unread_state_init_ms"
  | "phase1_realtime_prepare_ms"
  | "phase1_presence_prepare_ms"
  | "phase1_memo_compute_ms"
  | "phase1_large_array_count"
  | "phase1_initial_message_count"
  | "phase1_blocking_task_ms"
  | "chat_click_to_room_ready_ms"
  | "room_prefetch_start_ms"
  | "room_prefetch_done_ms"
  | "room_prefetch_wall_ms"
  | "room_prefetch_hit"
  | "resolve_done_to_prefetch_start_ms"
  | "prefetch_done_to_router_replace_ms"
  | "cm_room_bootstrap_fetch_ms"
  | "cm_room_bootstrap_payload_ms"
  | "cm_room_bootstrap_cache_hit"
  | "route_compile_ms"
  | "permission_modal_block_ms"
  | "trade_chat_duplicate_room_guard_ms"
  | "trade_realtime_subscribe_count"
  | "trade_realtime_unsubscribe_count"
  | "duplicate_subscribe_count"
  | "visible_trade_room_count"
  | "trade_realtime_debounce_unsubscribe_count"
  | "trade_realtime_active_room_pinned_count"
  | "trade_memory_heap_used_mb";

const TRADE_RT_COUNT_KEY = "__samarketTradeRealtimeSubscribeCounts" as const;

/** Playwright `page.evaluate` ↔ 앱 번들 `globalThis` 불일치 시 E2E baseline 이 읽을 수 있게 sessionStorage 미러 */
export const SAMARKET_E2E_TRADE_C2C_PHASE_SESSION_KEY = "samarket:debug:e2e:tradeC2cPhaseLastMs" as const;

function mirrorTradeC2CMetricToE2eSession(key: TradeC2CPerfMetricKey, ms: number): void {
  if (typeof window === "undefined") return;
  try {
    const allow =
      samarketRuntimeDebugEnabled() ||
      (typeof process !== "undefined" && process.env.NODE_ENV === "development");
    if (!allow) return;
    const prevRaw = sessionStorage.getItem(SAMARKET_E2E_TRADE_C2C_PHASE_SESSION_KEY);
    const prev = (prevRaw ? (JSON.parse(prevRaw) as Record<string, number>) : {}) as Record<string, number>;
    sessionStorage.setItem(
      SAMARKET_E2E_TRADE_C2C_PHASE_SESSION_KEY,
      JSON.stringify({ ...prev, [key]: ms })
    );
  } catch {
    /* quota / private mode */
  }
}

type TradeRtCounts = {
  subscribe: number;
  unsubscribe: number;
  duplicateSubscribe: number;
  debounceUnsubscribe: number;
  visibleTradeRoom: number;
  pinned: number;
};

function tradeRtCounts(): TradeRtCounts {
  const g = globalThis as typeof globalThis & { [TRADE_RT_COUNT_KEY]?: TradeRtCounts };
  if (!g[TRADE_RT_COUNT_KEY]) {
    g[TRADE_RT_COUNT_KEY] = {
      subscribe: 0,
      unsubscribe: 0,
      duplicateSubscribe: 0,
      debounceUnsubscribe: 0,
      visibleTradeRoom: 0,
      pinned: 0,
    };
  }
  return g[TRADE_RT_COUNT_KEY]!;
}

function logTradeRtSnapshot(): void {
  const c = tradeRtCounts();
  logClientPerf("trade_c2c", {
    trade_realtime_subscribe_count: c.subscribe,
    trade_realtime_unsubscribe_count: c.unsubscribe,
    duplicate_subscribe_count: c.duplicateSubscribe,
    visible_trade_room_count: c.visibleTradeRoom,
    trade_realtime_debounce_unsubscribe_count: c.debounceUnsubscribe,
    trade_realtime_active_room_pinned_count: c.pinned,
  });
}

export function isTradeC2CPerfEnabled(): boolean {
  return samarketRuntimeDebugEnabled() || isClientPerfLogEnabled();
}

/** 단일 ms 샘플 — 표준 키 + 기존 phase 맵 동시 갱신 */
export function recordTradeC2CMetricMs(key: TradeC2CPerfMetricKey, ms: number): void {
  if (!isTradeC2CPerfEnabled()) return;
  const rounded = Math.round(ms);
  recordAppWidePhaseLastMs(key, rounded);
  mirrorTradeC2CMetricToE2eSession(key, rounded);
  logClientPerf("trade_c2c", { [key]: rounded });
}

export function recordTradeListTotalMs(ms: number): void {
  recordTradeC2CMetricMs("trade_list_total_ms", ms);
}

export function recordTradeDetailTotalMs(ms: number): void {
  recordTradeC2CMetricMs("trade_detail_total_ms", ms);
}

export function recordTradeChatOpenTotalMs(ms: number): void {
  recordTradeC2CMetricMs("trade_chat_open_total_ms", ms);
}

/** @deprecated 이름 유지(기존 baseline) — 실제는 entry/resolve fetch 구간과 동일 샘플 */
export function recordTradeChatBootstrapMs(ms: number): void {
  recordTradeC2CMetricMs("trade_chat_bootstrap_ms", ms);
}

export function recordTradeChatResolveMs(ms: number): void {
  recordTradeC2CMetricMs("trade_chat_resolve_ms", ms);
}

export function recordTradeChatRedirectMs(ms: number): void {
  recordTradeC2CMetricMs("trade_chat_redirect_ms", ms);
}

export function recordCmRoomBootstrapFetchMs(ms: number): void {
  recordTradeC2CMetricMs("cm_room_bootstrap_fetch_ms", ms);
}

export function recordCmRoomBootstrapPayloadMs(ms: number): void {
  recordTradeC2CMetricMs("cm_room_bootstrap_payload_ms", ms);
}

export function recordCmRoomBootstrapCacheHit(hit: 0 | 1): void {
  recordTradeC2CMetricMs("cm_room_bootstrap_cache_hit", hit);
}

export function recordTradeChatRouteCompileMs(ms: number): void {
  recordTradeC2CMetricMs("route_compile_ms", ms);
}

export function recordPermissionModalBlockMs(ms: number): void {
  recordTradeC2CMetricMs("permission_modal_block_ms", ms);
}

/** 클라 itemRoomCache 히트·inflight 재사용 — 서버 DB 생략 구간 */
export function recordTradeChatDuplicateRoomGuardMs(ms: number): void {
  recordTradeC2CMetricMs("trade_chat_duplicate_room_guard_ms", ms);
}

/** API json 파싱 직후 — 디버그 시에만 호출(추가 stringify 없음) */
export function recordTradeListPayloadBytes(bytes: number): void {
  if (!isTradeC2CPerfEnabled()) return;
  if (!Number.isFinite(bytes) || bytes < 0) return;
  recordAppWidePhaseLastMs("trade_list_payload_bytes", Math.round(bytes));
  logClientPerf("trade_c2c", { trade_list_payload_bytes: Math.round(bytes) });
}

/**
 * 서버가 `X-Samarket-Db-Ms` 등을 내려주면 목록 db 구간으로 기록.
 * 없으면 `trade_home_posts_fetch_network_ms` 를 프록시로 별도 alias 하지 않음.
 */
export function recordTradeListDbMs(ms: number): void {
  recordTradeC2CMetricMs("trade_list_db_ms", ms);
}

export function bumpTradeRealtimeSubscribe(): void {
  if (!isTradeC2CPerfEnabled()) return;
  const c = tradeRtCounts();
  c.subscribe += 1;
  bumpAppWidePerf("realtime_subscribe_create");
  recordAppWidePhaseLastMs("trade_realtime_subscribe_count", c.subscribe);
  logTradeRtSnapshot();
}

export function bumpTradeRealtimeUnsubscribe(): void {
  if (!isTradeC2CPerfEnabled()) return;
  const c = tradeRtCounts();
  c.unsubscribe += 1;
  bumpAppWidePerf("realtime_subscribe_cleanup");
  recordAppWidePhaseLastMs("trade_realtime_unsubscribe_count", c.unsubscribe);
  logTradeRtSnapshot();
}

export function bumpTradeRealtimeDuplicateSubscribe(count = 1): void {
  if (!isTradeC2CPerfEnabled() || count <= 0) return;
  const c = tradeRtCounts();
  c.duplicateSubscribe += count;
  recordAppWidePhaseLastMs("duplicate_subscribe_count", c.duplicateSubscribe);
  logTradeRtSnapshot();
}

export function bumpTradeRealtimeDebounceUnsubscribe(count = 1): void {
  if (!isTradeC2CPerfEnabled() || count <= 0) return;
  const c = tradeRtCounts();
  c.debounceUnsubscribe += count;
  recordAppWidePhaseLastMs("trade_realtime_debounce_unsubscribe_count", c.debounceUnsubscribe);
  logTradeRtSnapshot();
}

export function recordTradeVisibleRoomCount(count: number): void {
  if (!isTradeC2CPerfEnabled()) return;
  const c = tradeRtCounts();
  c.visibleTradeRoom = count;
  recordAppWidePhaseLastMs("visible_trade_room_count", count);
  logTradeRtSnapshot();
}

export function recordTradeRealtimePinnedCount(count: number): void {
  if (!isTradeC2CPerfEnabled()) return;
  const c = tradeRtCounts();
  c.pinned = count;
  recordAppWidePhaseLastMs("trade_realtime_active_room_pinned_count", count);
  logTradeRtSnapshot();
}

/** Chromium `performance.memory` — dev·디버그만 */
export function sampleTradeMemoryHeapUsedMb(): void {
  if (!isTradeC2CPerfEnabled()) return;
  if (typeof performance === "undefined") return;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const used = mem?.usedJSHeapSize;
  if (typeof used !== "number" || !Number.isFinite(used)) return;
  const mb = used / (1024 * 1024);
  recordTradeC2CMetricMs("trade_memory_heap_used_mb", mb);
}
