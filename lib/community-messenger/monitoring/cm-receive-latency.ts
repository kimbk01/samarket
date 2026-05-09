"use client";

type CmReceiveLatencyEntry = Partial<{
  sender_click_ms: number;
  send_api_start_ms: number;
  send_api_done_ms: number;
  db_message_created_at: string;
  realtime_event_received_ms: number;
  realtime_payload_room_id: string;
  realtime_payload_message_id: string;
  receiver_store_apply_start_ms: number;
  receiver_store_apply_done_ms: number;
  unread_delta_applied_ms: number;
  bottom_badge_updated_ms: number;
  room_list_row_updated_ms: number;
  notification_decision_ms: number;
  notification_sound_start_ms: number;
  push_decision_ms: number;
  total_receive_elapsed_ms: number;
}>;

type CmReceiveLatencyKey = string;

/**
 * 메시지 1건의 receive lifecycle 을 keyed entry 로 누적한 뒤 **microtask 단위로 coalesce 해 1회만**
 * `console.info` 한다.
 *
 * 계약 (헌장 §「근본 대책만」 / hot path direct logging 금지):
 *   - `byKey` 는 메시지 키 단위 Map. **insertion-order 기반 FIFO cap = `MAP_CAP`** 으로 단조 누적 차단.
 *   - 같은 microtask 안에서 같은 key 로 들어온 patch 는 **`Object.assign` 으로 누적** 되고,
 *     가장 마지막 누적 상태가 1회만 출력된다 (DevTools console 이 retain 하는 누적 spread 객체 폭증 차단).
 *   - 다른 microtask 에 들어온 후속 patch 는 다음 flush 에서 1회 더 출력 — 정보 손실 없음.
 *   - production 빌드는 mark / flush 모두 무동작 (`process.env.NODE_ENV === "production"` 가드).
 *   - `cmReceiveLatencyDump` / `cmReceiveLatencyClear` window 헬퍼는 동일 시그니처로 보존 (E2E·재현용).
 *
 * `queueMicrotask` 는 hot path 코드와 **같은 JavaScript turn** 안의 모든 mark 를 한 번만 출력하기 위한
 * **이벤트루프 경계 coalesce** 로, 시간 기반 throttle/debounce 가 아니다 (사용자 요청 §「임시 throttle 우회 금지」 준수).
 */
type CmReceiveLatencyStore = {
  v: 2;
  byKey: Map<CmReceiveLatencyKey, CmReceiveLatencyEntry>;
  pendingPrintKeys: Set<CmReceiveLatencyKey>;
  flushScheduled: boolean;
};

const MAP_CAP = 256;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function isV2Store(value: unknown): value is CmReceiveLatencyStore {
  if (!value || typeof value !== "object") return false;
  const cast = value as Partial<CmReceiveLatencyStore> & { byKey?: unknown; pendingPrintKeys?: unknown };
  return (
    cast.v === 2 &&
    cast.byKey instanceof Map &&
    cast.pendingPrintKeys instanceof Set &&
    typeof cast.flushScheduled === "boolean"
  );
}

function store(): CmReceiveLatencyStore | null {
  if (typeof window === "undefined") return null;
  const anyWin = window as unknown as { __cmReceiveLatency?: unknown };
  const existing = anyWin.__cmReceiveLatency;
  if (isV2Store(existing)) return existing;
  /**
   * v1 → v2 마이그레이션 (HMR · 새 빌드 후 첫 호출).
   * 이전 byKey 가 cap 을 넘으면 가장 오래된 것부터 잘라낸다 (Map 의 insertion order = FIFO).
   */
  const carriedByKey =
    existing && typeof existing === "object" && (existing as { byKey?: unknown }).byKey instanceof Map
      ? ((existing as { byKey: Map<CmReceiveLatencyKey, CmReceiveLatencyEntry> }).byKey)
      : new Map<CmReceiveLatencyKey, CmReceiveLatencyEntry>();
  const trimmed = new Map<CmReceiveLatencyKey, CmReceiveLatencyEntry>();
  const all = [...carriedByKey.entries()];
  const start = all.length > MAP_CAP ? all.length - MAP_CAP : 0;
  for (let i = start; i < all.length; i += 1) trimmed.set(all[i][0], all[i][1]);
  const next: CmReceiveLatencyStore = {
    v: 2,
    byKey: trimmed,
    pendingPrintKeys: new Set<CmReceiveLatencyKey>(),
    flushScheduled: false,
  };
  anyWin.__cmReceiveLatency = next;
  return next;
}

export function cmReceiveLatencyKey(args: {
  roomId: string;
  messageId?: string | null;
  clientMessageId?: string | null;
}): string {
  const r = args.roomId?.trim() ?? "";
  const mid = args.messageId?.trim() ?? "";
  const cmid = args.clientMessageId?.trim() ?? "";
  if (mid) return `msg:${r}:${mid}`;
  if (cmid) return `client:${r}:${cmid}`;
  return `room:${r}:${Math.round(nowMs())}`;
}

function flushPendingPrints(s: CmReceiveLatencyStore): void {
  s.flushScheduled = false;
  if (s.pendingPrintKeys.size === 0) return;
  const keys = [...s.pendingPrintKeys];
  s.pendingPrintKeys.clear();
  for (const key of keys) {
    const entry = s.byKey.get(key);
    if (!entry) continue;
    /** 누적 spread 는 flush 시점 1회만 — DevTools 가 retain 하는 객체 수가 키당 1회로 수렴. */
    // eslint-disable-next-line no-console
    console.info("[cm-receive-latency]", { key, ...entry });
  }
}

function scheduleFlushIfNeeded(s: CmReceiveLatencyStore): void {
  if (s.flushScheduled) return;
  s.flushScheduled = true;
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => flushPendingPrints(s));
    return;
  }
  /** 매우 오래된 환경 fallback — Promise.resolve().then 도 microtask. */
  void Promise.resolve().then(() => flushPendingPrints(s));
}

export function cmReceiveLatencyMark(key: CmReceiveLatencyKey, patch: CmReceiveLatencyEntry): void {
  if (process.env.NODE_ENV === "production") return;
  const s = store();
  if (!s) return;
  const prev = s.byKey.get(key);
  if (prev) {
    /** 같은 key 재방문 — Map insertion order(=FIFO 위치) 는 그대로 유지하고 값만 누적. */
    Object.assign(prev, patch);
  } else {
    if (s.byKey.size >= MAP_CAP) {
      const oldest = s.byKey.keys().next();
      if (!oldest.done) {
        s.byKey.delete(oldest.value);
        s.pendingPrintKeys.delete(oldest.value);
      }
    }
    /** 새 entry 는 patch 사본을 보관해 호출자 객체 mutation 으로부터 격리. */
    s.byKey.set(key, { ...patch });
  }
  s.pendingPrintKeys.add(key);
  scheduleFlushIfNeeded(s);
}

export function cmReceiveLatencyMarkPoint(
  key: CmReceiveLatencyKey,
  field: keyof CmReceiveLatencyEntry,
  value?: number | string
): void {
  if (process.env.NODE_ENV === "production") return;
  if (value === undefined) return;
  cmReceiveLatencyMark(key, { [field]: value } as CmReceiveLatencyEntry);
}

export function cmReceiveLatencyNow(): number {
  return nowMs();
}

function attachDevConsoleHelpers(): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  const anyWin = window as unknown as {
    __cmReceiveLatencyHelpersAttached?: boolean;
    cmReceiveLatencyDump?: () => Array<{ key: string } & CmReceiveLatencyEntry>;
    cmReceiveLatencyClear?: () => void;
  };
  if (anyWin.__cmReceiveLatencyHelpersAttached) return;
  anyWin.__cmReceiveLatencyHelpersAttached = true;
  anyWin.cmReceiveLatencyDump = () => {
    const s = store();
    if (!s) return [];
    return [...s.byKey.entries()].map(([key, value]) => ({ key, ...value }));
  };
  anyWin.cmReceiveLatencyClear = () => {
    const s = store();
    if (!s) return;
    s.byKey.clear();
    s.pendingPrintKeys.clear();
  };

  // eslint-disable-next-line no-console
  console.info("[cm-receive-latency]", "helpers_attached", {
    hasDump: typeof anyWin.cmReceiveLatencyDump === "function",
    hasClear: typeof anyWin.cmReceiveLatencyClear === "function",
  });
}

attachDevConsoleHelpers();
