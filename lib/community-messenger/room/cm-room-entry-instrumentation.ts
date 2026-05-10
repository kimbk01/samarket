/**
 * Room entry perf — unread/read ack/realtime 의미 변경 없이 **측정·로그만** 담당.
 * 켜기: `NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY=1` 또는 `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` (클라 번들).
 */

const MILESTONE_KEYS = [
  "room_shell_visible_ms",
  "message_list_visible_ms",
  "composer_visible_ms",
  "realtime_ready_ms",
  "deferred_history_ms",
] as const;

type MilestoneKey = (typeof MILESTONE_KEYS)[number];

let routeT0Perf = 0;
const milestones: Partial<Record<MilestoneKey, number>> = {};
let lastBootstrapPayloadKb = 0;
let lastUsedPrefetch = false;
let lastUsedCachedSnapshot = false;
let v2EmittedForRoom: string | null = null;

export function cmRoomEntryTraceEnabled(): boolean {
  try {
    return (
      typeof process !== "undefined" &&
      typeof process.env !== "undefined" &&
      (process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY === "1" ||
        process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1")
    );
  } catch {
    return false;
  }
}

/** 목록에서 방으로 push 직전 — 진입 세션 시작 시각 */
export function markCmRoomEntryForwardNavigation(): void {
  if (!cmRoomEntryTraceEnabled()) return;
  routeT0Perf = typeof performance !== "undefined" ? performance.now() : 0;
}

/** 직링크 등 forward nav 없이 방이 열릴 때 t0 보정 */
export function ensureCmRoomEntryRouteT0(): number {
  if (!cmRoomEntryTraceEnabled()) return 0;
  if (routeT0Perf <= 0 && typeof performance !== "undefined") {
    routeT0Perf = performance.now();
  }
  return routeT0Perf;
}

export function resetCmRoomEntryTraceSession(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = String(roomId ?? "").trim();
  if (!id) return;
  /** `routeT0Perf` 는 유지 — `markCmRoomEntryForwardNavigation` 가 탭 직후 찍은 기준시각 */
  for (const k of MILESTONE_KEYS) delete milestones[k];
  lastBootstrapPayloadKb = 0;
  lastUsedPrefetch = false;
  lastUsedCachedSnapshot = false;
  v2EmittedForRoom = null;
}

export function recordCmRoomEntryMilestone(key: MilestoneKey): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (routeT0Perf <= 0) ensureCmRoomEntryRouteT0();
  if (routeT0Perf <= 0 || typeof performance === "undefined") return;
  if (milestones[key] != null) return;
  milestones[key] = Math.round(performance.now() - routeT0Perf);
}

export function setCmRoomEntryBootstrapMeta(meta: {
  payload_kb: number;
  used_prefetch: boolean;
  used_cached_snapshot: boolean;
}): void {
  if (!cmRoomEntryTraceEnabled()) return;
  lastBootstrapPayloadKb = meta.payload_kb;
  lastUsedPrefetch = meta.used_prefetch;
  lastUsedCachedSnapshot = meta.used_cached_snapshot;
}

export function logCmRoomEntryAnalysis(payload: Record<string, unknown>): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[cm-room-entry-analysis]", JSON.stringify(payload));
  }
}

/**
 * 한 방 진입당 1회 — Phase2 가 메시지·셸 마일스톤을 찍은 뒤 호출.
 */
export function tryEmitCmRoomEntryV2Log(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = String(roomId ?? "").trim();
  if (!id || v2EmittedForRoom === id) return;
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  v2EmittedForRoom = id;
  const body = {
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    room_shell_visible_ms: milestones.room_shell_visible_ms ?? null,
    message_list_visible_ms: milestones.message_list_visible_ms ?? null,
    composer_visible_ms: milestones.composer_visible_ms ?? null,
    realtime_ready_ms: milestones.realtime_ready_ms ?? null,
    deferred_history_ms: milestones.deferred_history_ms ?? null,
    payload_kb: lastBootstrapPayloadKb,
    used_prefetch: lastUsedPrefetch,
    used_cached_snapshot: lastUsedCachedSnapshot,
  };
  // eslint-disable-next-line no-console -- gated room entry v2
  console.debug("[cm-room-entry-v2]", JSON.stringify(body));
}
