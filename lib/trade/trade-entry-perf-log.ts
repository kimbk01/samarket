/**
 * `TRADE_ENTRY_PERF_LOG=1` 일 때만 서버 콘솔에 단계별 ms (누적·구간).
 * 프로덕션 기본은 오프.
 */

const ENABLED = process.env.TRADE_ENTRY_PERF_LOG === "1";

export type TradeEntryPerfBucket =
  | "auth_ms"
  | "product_chat_lookup_ms"
  | "product_chat_create_ms"
  | "cm_room_lookup_ms"
  | "cm_room_create_ms"
  | "participant_ensure_ms"
  | "chat_room_fk_update_ms"
  | "context_meta_defer_schedule_ms";

export type TradeEntryPerfTrace = {
  /** 구간 소요(ms) — 직전 mark 이후 */
  mark: (phase: string) => void;
  /** 스코프 레이블과 함께 한 줄 로그 */
  finish: (scope: string, extra?: Record<string, unknown>) => void;
  addBucket: (bucket: TradeEntryPerfBucket, ms: number) => void;
  noteDbRoundTrip: (count?: number) => void;
};

function sumSegments(segments: Record<string, number>, keys: string[]): number {
  let n = 0;
  for (const k of keys) {
    const v = segments[k];
    if (typeof v === "number" && Number.isFinite(v)) n += v;
  }
  return Math.round(n);
}

/** `finish` 시 함께 출력할 resolve 분해(요청 키) */
export function buildTradeEntryResolveBreakdown(
  segments: Record<string, number>,
  buckets: Partial<Record<TradeEntryPerfBucket, number>>,
  dbRoundTrips: number
): Record<string, number> {
  const authMs =
    (buckets.auth_ms ?? 0) +
    sumSegments(segments, ["resolve_route_auth", "resolve_route_session", "item_access_and_post_parallel"]);
  const productChatLookup =
    (buckets.product_chat_lookup_ms ?? 0) +
    sumSegments(segments, [
      "room_existing_pc_minimal_select",
      "messenger_pc_lookup",
      "messenger_room_existing_fast_path_pc_ensure",
      "room_existing_parallel_load",
    ]);
  const productChatCreate =
    (buckets.product_chat_create_ms ?? 0) + sumSegments(segments, ["messenger_pc_insert", "product_chat_insert"]);
  const cmLookup =
    (buckets.cm_room_lookup_ms ?? 0) +
    sumSegments(segments, ["cm_direct_room_lookup", "messenger_cm_lookup", "messenger_room_ensure_sync"]);
  const cmCreate = (buckets.cm_room_create_ms ?? 0) + sumSegments(segments, ["cm_direct_room_create"]);
  const participantEnsure =
    (buckets.participant_ensure_ms ?? 0) +
    sumSegments(segments, [
      "room_existing_participants_load",
      "room_existing_participants_reopen_updates_start",
      "room_existing_participants_reopen_updates_done",
      "cm_participant_ensure",
    ]);
  const chatRoomFk =
    (buckets.chat_room_fk_update_ms ?? 0) +
    sumSegments(segments, [
      "room_existing_chat_rooms_link_select",
      "messenger_existing_fast_path_pc_backfill",
      "messenger_pc_persist",
      "chat_room_fk_sync",
    ]);
  const contextDefer =
    (buckets.context_meta_defer_schedule_ms ?? 0) +
    sumSegments(segments, ["context_meta_defer_schedule", "messenger_room_schedule_after"]);

  return {
    auth_ms: authMs,
    product_chat_lookup_ms: productChatLookup,
    product_chat_create_ms: productChatCreate,
    cm_room_lookup_ms: cmLookup,
    cm_room_create_ms: cmCreate,
    participant_ensure_ms: participantEnsure,
    chat_room_fk_update_ms: chatRoomFk,
    context_meta_defer_schedule_ms: contextDefer,
    total_db_round_trips: dbRoundTrips,
    resolve_total_ms: segments._total_ms ?? segments.resolve_total_ms ?? 0,
  };
}

export function createTradeEntryPerfTrace(): TradeEntryPerfTrace | null {
  if (!ENABLED) return null;
  const tStart = performance.now();
  const segments: Record<string, number> = {};
  const buckets: Partial<Record<TradeEntryPerfBucket, number>> = {};
  let dbRoundTrips = 0;
  let tLast = tStart;

  return {
    mark(phase: string) {
      const now = performance.now();
      segments[phase] = Math.round(now - tLast);
      tLast = now;
    },
    addBucket(bucket: TradeEntryPerfBucket, ms: number) {
      if (!Number.isFinite(ms) || ms < 0) return;
      buckets[bucket] = Math.round((buckets[bucket] ?? 0) + ms);
    },
    noteDbRoundTrip(count = 1) {
      dbRoundTrips += count;
    },
    finish(scope: string, extra?: Record<string, unknown>) {
      segments._total_ms = Math.round(performance.now() - tStart);
      const breakdown = buildTradeEntryResolveBreakdown(segments, buckets, dbRoundTrips);
      console.info(`[trade-entry-perf] ${scope}`, { ...segments, ...breakdown, ...extra });
    },
  };
}
