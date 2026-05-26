/**
 * 거래 채팅 목록 — viewport visible room Realtime 구독 집합(전역, UI 무관).
 * IntersectionObserver 는 `use-messenger-room-list-prefetch-intersection` 에서 기존 ref 에 연동.
 */
import {
  TRADE_ROOM_REALTIME_UNSUBSCRIBE_DEBOUNCE_MS,
  TRADE_VISIBLE_ROOM_REALTIME_SUBSCRIBE_MAX,
  capVisibleRoomIdsForTradeRealtime,
} from "@/lib/trade/trade-realtime-subscribe-policy";
import {
  bumpTradeRealtimeDuplicateSubscribe,
  bumpTradeRealtimeDebounceUnsubscribe,
  bumpTradeRealtimeSubscribe,
  bumpTradeRealtimeUnsubscribe,
  recordTradeRealtimePinnedCount,
  recordTradeVisibleRoomCount,
} from "@/lib/trade/trade-c2c-perf-metrics";

function norm(id: string): string {
  return id.trim();
}

type Listener = () => void;

let reportingEnabled = false;
const pinnedIds = new Set<string>();
const viewportVisibleIds = new Set<string>();
/** viewport 이탈 후 debounce 동안 구독 유지 */
const graceIds = new Set<string>();
const pendingUnsubTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastSubscribeSet = new Set<string>();
let lastOutputFingerprint = "";

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function scheduleNotify(): void {
  if (notifyTimer != null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const next = buildOrderedSubscribeIds();
    const fp = next.join("\0");
    if (fp === lastOutputFingerprint) return;
    lastOutputFingerprint = fp;
    diffSubscribeSet(next);
    recordTradeVisibleRoomCount(viewportVisibleIds.size);
    for (const fn of listeners) fn();
  }, 32);
}

function clearPendingUnsub(roomId: string): void {
  const t = pendingUnsubTimers.get(roomId);
  if (t != null) {
    clearTimeout(t);
    pendingUnsubTimers.delete(roomId);
  }
}

function startPendingUnsub(roomId: string): void {
  if (pinnedIds.has(roomId)) return;
  clearPendingUnsub(roomId);
  graceIds.add(roomId);
  pendingUnsubTimers.set(
    roomId,
    setTimeout(() => {
      pendingUnsubTimers.delete(roomId);
      graceIds.delete(roomId);
      bumpTradeRealtimeDebounceUnsubscribe();
      scheduleNotify();
    }, TRADE_ROOM_REALTIME_UNSUBSCRIBE_DEBOUNCE_MS)
  );
}

function buildOrderedSubscribeIds(): string[] {
  const pinned = [...pinnedIds];
  const pinnedSet = new Set(pinned);
  const visible = [...viewportVisibleIds].filter((id) => !pinnedSet.has(id));
  const grace = [...graceIds].filter((id) => !pinnedSet.has(id));

  const max = TRADE_VISIBLE_ROOM_REALTIME_SUBSCRIBE_MAX;
  let remaining = Math.max(0, max - pinned.length);
  const visibleCapped = visible.slice(0, remaining);
  remaining -= visibleCapped.length;
  const visibleSet = new Set(visibleCapped);
  const graceCapped = grace.filter((id) => !visibleSet.has(id)).slice(0, remaining);
  return [...pinned, ...visibleCapped, ...graceCapped];
}

function diffSubscribeSet(next: string[]): void {
  const nextSet = new Set(next);
  let duplicate = 0;
  for (const id of next) {
    if (lastSubscribeSet.has(id)) duplicate += 1;
    else bumpTradeRealtimeSubscribe();
  }
  for (const id of lastSubscribeSet) {
    if (!nextSet.has(id)) bumpTradeRealtimeUnsubscribe();
  }
  if (duplicate > 0) bumpTradeRealtimeDuplicateSubscribe(duplicate);
  lastSubscribeSet.clear();
  for (const id of next) lastSubscribeSet.add(id);
}

export function setTradeVisibleRoomRealtimeReportingEnabled(enabled: boolean): void {
  if (reportingEnabled === enabled) return;
  reportingEnabled = enabled;
  if (!enabled) {
    for (const t of pendingUnsubTimers.values()) clearTimeout(t);
    pendingUnsubTimers.clear();
    viewportVisibleIds.clear();
    graceIds.clear();
    lastOutputFingerprint = "";
    scheduleNotify();
  }
}

export function isTradeVisibleRoomRealtimeReportingEnabled(): boolean {
  return reportingEnabled;
}

export function setTradeVisibleRoomRealtimePinnedIds(ids: readonly string[]): void {
  const next = new Set(ids.map(norm).filter(Boolean));
  let changed = next.size !== pinnedIds.size;
  if (!changed) {
    for (const id of next) {
      if (!pinnedIds.has(id)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  pinnedIds.clear();
  for (const id of next) {
    pinnedIds.add(id);
    clearPendingUnsub(id);
    graceIds.delete(id);
  }
  recordTradeRealtimePinnedCount(pinnedIds.size);
  scheduleNotify();
}

/** 목록에서 사라진 방 — IO 콜백 없이 registry 정리(재정렬만이면 no-op) */
export function pruneTradeVisibleRoomRegistry(allowedRoomIds: readonly string[]): void {
  if (!reportingEnabled) return;
  const allowed = new Set(allowedRoomIds.map(norm).filter(Boolean));
  let changed = false;
  for (const id of [...viewportVisibleIds]) {
    if (allowed.has(id)) continue;
    viewportVisibleIds.delete(id);
    if (!pinnedIds.has(id)) {
      startPendingUnsub(id);
      changed = true;
    }
  }
  if (changed) scheduleNotify();
}

export function reportTradeRoomListIntersection(roomId: string, isIntersecting: boolean): void {
  if (!reportingEnabled) return;
  const id = norm(roomId);
  if (!id) return;
  if (isIntersecting) {
    viewportVisibleIds.add(id);
    clearPendingUnsub(id);
    graceIds.delete(id);
    scheduleNotify();
    return;
  }
  viewportVisibleIds.delete(id);
  if (pinnedIds.has(id)) return;
  startPendingUnsub(id);
  scheduleNotify();
}

export function getTradeVisibleRoomSubscribeIds(): string[] {
  return buildOrderedSubscribeIds();
}

export function subscribeTradeVisibleRoomRealtimeSubscribeSet(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 홈 route 방 + capped visible — bootstrap·열린 방은 cap 밖 */
export function mergeHomeAndTradeVisibleRealtimeRoomIds(
  homeRouteRoomIds: readonly string[],
  visibleTradeRoomIds: readonly string[]
): string[] {
  const home = [...new Set(homeRouteRoomIds.map(norm).filter(Boolean))];
  const homeSet = new Set(home);
  const visibleCapped = capVisibleRoomIdsForTradeRealtime(
    visibleTradeRoomIds.filter((id) => !homeSet.has(norm(id))),
    TRADE_VISIBLE_ROOM_REALTIME_SUBSCRIBE_MAX
  );
  return [...new Set([...home, ...visibleCapped])].sort();
}
