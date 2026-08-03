import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { prefetchTrace } from "@/lib/community-messenger/prefetch-dev-trace";
import {
  markRoomPrefetchAttempt,
  markRoomPrefetchComplete,
  wasRoomPrefetchRecentlySuccessful,
} from "@/lib/community-messenger/room/cm-bootstrap-scheduling";
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { isMessengerRoomBootstrapReadySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import {
  applyAtomicRoomRead,
} from "@/lib/chat-domain/room-read/atomic-room-read";
import { roomReadVersionFromSnapshot } from "@/lib/chat-domain/room-read/attach-room-read-version";
import { withRoomReadVersion } from "@/lib/chat-domain/room-read/attach-room-read-version";

const TTL_MS = 60_000;
/** 방 스냅샷 메인 캐시 — LRU 상한 50 (접근 시 순서 bump, TTL 60s 유지) */
const MAX_ENTRIES = 50;
const entries = new Map<string, { snapshot: CommunityMessengerRoomSnapshot; at: number }>();
/**
 * 목록 프리패치 — 입장 차단 부트스트랩과 동일한 critical/instant 슬라이스로 정렬(네트워크 burst 는 큐·동시 2 로 제한).
 */
const ROOM_PREFETCH_QUERY = `?mode=instant&memberHydration=minimal&hydration=critical&cmReqSrc=list_prefetch&messages=${COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT}`;

let lastPrefetchSuccessRoomId = "";
let lastPrefetchSuccessAt = 0;

/** 입장 직전에 프리패치가 성공해 캐시에 실렸다는 힌트(1회 소비) — `list_prefetch` critical GET 완료 시에만 true */
export function consumePrefetchHitForRoom(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id || id !== lastPrefetchSuccessRoomId) return false;
  if (Date.now() - lastPrefetchSuccessAt > 15_000) {
    lastPrefetchSuccessRoomId = "";
    lastPrefetchSuccessAt = 0;
    return false;
  }
  lastPrefetchSuccessRoomId = "";
  lastPrefetchSuccessAt = 0;
  return true;
}

/** 목록 프리패치 TTL과 별개 — 같은 방 재입장 시 `consume` 으로 지워지지 않게 유지(메인 LRU 와 유사 규모) */
const HOT_MAX = 55;
const hotEntries = new Map<string, CommunityMessengerRoomSnapshot>();

function pruneHotIfNeeded(): void {
  while (hotEntries.size > HOT_MAX) {
    const first = hotEntries.keys().next().value as string | undefined;
    if (first === undefined) break;
    hotEntries.delete(first);
  }
}

function cacheKey(roomId: string, viewerUserId: string | null | undefined): string {
  const r = roomId.trim();
  const v = (viewerUserId ?? "").trim() || "_";
  return `${v}:${r}`;
}

const STALE_EVICT_MS = 5 * 60 * 1000;

function pruneIfNeeded(now = Date.now()): void {
  for (const [k, v] of entries) {
    if (now - v.at > STALE_EVICT_MS) entries.delete(k);
  }
  if (entries.size <= MAX_ENTRIES) return;
  const overflow = entries.size - MAX_ENTRIES;
  let i = 0;
  for (const k of entries.keys()) {
    entries.delete(k);
    i += 1;
    if (i >= overflow) break;
  }
}

/** Map 삽입 순서 = LRU — 기존 키는 삭제 후 다시 넣어 최근 사용으로 올린다(TTL 시각 `at` 유지). */
function touchLruEntry(key: string): void {
  const row = entries.get(key);
  if (!row) return;
  entries.delete(key);
  entries.set(key, row);
}

export function primeRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot) {
  if (!isMessengerRoomBootstrapReadySnapshot(snapshot)) return;
  const incoming = withRoomReadVersion(
    snapshot,
    snapshot.readVersionSource ?? "server_bootstrap",
  );
  const k = cacheKey(roomId, incoming.viewerUserId);
  const existing = entries.get(k);
  if (existing) {
    const applied = applyAtomicRoomRead({
      prevValue: existing.snapshot,
      prevVersion: roomReadVersionFromSnapshot(existing.snapshot, "memory_cache"),
      incomingValue: incoming,
      incomingVersion: roomReadVersionFromSnapshot(incoming, incoming.readVersionSource ?? "server_bootstrap"),
    });
    if (!applied.accepted) return;
    entries.delete(k);
    entries.set(k, { snapshot: applied.value, at: Date.now() });
  } else {
    entries.delete(k);
    entries.set(k, { snapshot: incoming, at: Date.now() });
  }
  pruneIfNeeded();
}

function mergeMessages(
  prev: CommunityMessengerMessage[],
  nextMessage: CommunityMessengerMessage
): CommunityMessengerMessage[] {
  const next = prev.filter((item) => item.id !== nextMessage.id);
  next.push(nextMessage);
  next.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return next;
}

function patchEntryMap(
  map: Map<string, { snapshot: CommunityMessengerRoomSnapshot; at: number }>,
  roomId: string,
  viewerUserId: string,
  updater: (snapshot: CommunityMessengerRoomSnapshot) => CommunityMessengerRoomSnapshot
): void {
  const key = cacheKey(roomId, viewerUserId);
  const row = map.get(key);
  if (!row) return;
  map.set(key, { snapshot: updater(row.snapshot), at: Date.now() });
}

function patchHotMap(
  roomId: string,
  viewerUserId: string,
  updater: (snapshot: CommunityMessengerRoomSnapshot) => CommunityMessengerRoomSnapshot
): void {
  const key = cacheKey(roomId, viewerUserId);
  const row = hotEntries.get(key);
  if (!row) return;
  hotEntries.set(key, updater(row));
}

/** 방 이탈·갱신 시 마지막 스냅샷을 보관 — 재입장 시 RSC·consume 전에 첫 프레임에 사용 */
export function primeHotRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot): void {
  if (!isMessengerRoomBootstrapReadySnapshot(snapshot)) return;
  const k = cacheKey(roomId, snapshot.viewerUserId);
  if (hotEntries.has(k)) hotEntries.delete(k);
  hotEntries.set(k, snapshot);
  pruneHotIfNeeded();
}

export function peekHotRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  const r = roomId.trim();
  if (!r) return null;
  const viewer = typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  if (!viewer) return null;
  const k = cacheKey(r, viewer);
  const row = hotEntries.get(k);
  if (!row) return null;
  if (!isMessengerRoomBootstrapReadySnapshot(row)) {
    hotEntries.delete(k);
    return null;
  }
  return row;
}

/**
 * @param viewerUserId 현재 로그인 사용자 id — 필수(계정 격리).
 */
export function peekRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  const r = roomId.trim();
  if (!r) return null;
  const viewer = typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  if (!viewer) return null;
  const k = cacheKey(r, viewer);
  const row = entries.get(k);
  if (!row) return null;
  if (!isMessengerRoomBootstrapReadySnapshot(row.snapshot)) {
    entries.delete(k);
    return null;
  }
  touchLruEntry(k);
  return row.snapshot;
}

export function isRoomSnapshotFresh(roomId: string, viewerUserId?: string | null): boolean {
  return isRoomSnapshotFreshWithin(roomId, TTL_MS, viewerUserId);
}

/** 캐시 행 age(ms). 없으면 null */
export function getRoomSnapshotCacheAgeMs(
  roomId: string,
  viewerUserId?: string | null
): number | null {
  const r = roomId.trim();
  if (!r) return null;
  const now = Date.now();
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const row = entries.get(cacheKey(r, viewerUserId.trim()));
    return row ? now - row.at : null;
  }
  const suffix = `:${r}`;
  let bestAt: number | null = null;
  for (const [k, row] of entries) {
    if (!k.endsWith(suffix)) continue;
    if (bestAt == null || row.at > bestAt) bestAt = row.at;
  }
  return bestAt != null ? now - bestAt : null;
}

export function isRoomSnapshotFreshWithin(
  roomId: string,
  maxAgeMs: number,
  viewerUserId?: string | null
): boolean {
  const r = roomId.trim();
  if (!r || maxAgeMs <= 0) return false;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const row = entries.get(cacheKey(r, viewerUserId.trim()));
    return !!row && isMessengerRoomBootstrapReadySnapshot(row.snapshot) && Date.now() - row.at <= maxAgeMs;
  }
  const suffix = `:${r}`;
  for (const [k, row] of entries) {
    if (
      k.endsWith(suffix) &&
      isMessengerRoomBootstrapReadySnapshot(row.snapshot) &&
      Date.now() - row.at <= maxAgeMs
    ) {
      return true;
    }
  }
  return false;
}

/** 방 id 에 해당하는 모든 뷰어 버킷 캐시 제거 */
export function invalidateRoomSnapshot(roomId: string): void {
  const suffix = `:${roomId.trim()}`;
  if (suffix.length <= 1) return;
  for (const k of Array.from(entries.keys())) {
    if (k.endsWith(suffix)) entries.delete(k);
  }
  for (const k of Array.from(hotEntries.keys())) {
    if (k.endsWith(suffix)) hotEntries.delete(k);
  }
}

/** 로그아웃·계정 전환 — 방 스냅샷 LRU·hot 캐시 전부 제거 */
export function clearAllRoomSnapshotCaches(): void {
  entries.clear();
  hotEntries.clear();
  lastPrefetchSuccessRoomId = "";
  lastPrefetchSuccessAt = 0;
}

export function seedRoomSnapshotFromSummary(args: {
  room: CommunityMessengerRoomSummary;
  viewerUserId: string;
  message?: CommunityMessengerMessage | null;
}): void {
  const roomId = args.room.id.trim();
  const viewerUserId = args.viewerUserId.trim();
  if (!roomId || !viewerUserId) return;
  const existing = peekRoomSnapshot(roomId, viewerUserId);
  const base: CommunityMessengerRoomSnapshot =
    existing ??
    ({
      viewerUserId,
      room: args.room,
      members: [],
      messages: [],
      myRole: "member",
      activeCall: null,
    } satisfies CommunityMessengerRoomSnapshot);
  const nextMessages = args.message ? mergeMessages(base.messages ?? [], args.message) : base.messages ?? [];
  const next = {
    ...base,
    room: { ...base.room, ...args.room },
    messages: nextMessages,
  } satisfies CommunityMessengerRoomSnapshot;
  primeRoomSnapshot(roomId, next);
  primeHotRoomSnapshot(roomId, next);
}

export function mergeMessageIntoRoomSnapshotCache(args: {
  roomId: string;
  viewerUserId: string;
  roomSummary?: CommunityMessengerRoomSummary | null;
  message: CommunityMessengerMessage;
}): void {
  const roomId = args.roomId.trim();
  const viewerUserId = args.viewerUserId.trim();
  if (!roomId || !viewerUserId) return;
  const existing = peekRoomSnapshot(roomId, viewerUserId);
  if (!existing && args.roomSummary) {
    seedRoomSnapshotFromSummary({
      room: args.roomSummary,
      viewerUserId,
      message: args.message,
    });
    return;
  }
  if (!existing) return;
  const update = (snapshot: CommunityMessengerRoomSnapshot) =>
    ({
      ...snapshot,
      ...(args.roomSummary ? { room: { ...snapshot.room, ...args.roomSummary } } : null),
      messages: mergeMessages(snapshot.messages ?? [], args.message),
    } satisfies CommunityMessengerRoomSnapshot);
  patchEntryMap(entries, roomId, viewerUserId, update);
  patchHotMap(roomId, viewerUserId, update);
}

export function patchRoomSummaryInSnapshotCache(args: {
  roomId: string;
  viewerUserId: string;
  patch: Partial<CommunityMessengerRoomSummary>;
}): void {
  const roomId = args.roomId.trim();
  const viewerUserId = args.viewerUserId.trim();
  if (!roomId || !viewerUserId) return;
  const update = (snapshot: CommunityMessengerRoomSnapshot) =>
    ({
      ...snapshot,
      room: { ...snapshot.room, ...args.patch },
    } satisfies CommunityMessengerRoomSnapshot);
  patchEntryMap(entries, roomId, viewerUserId, update);
  patchHotMap(roomId, viewerUserId, update);
}

/**
 * Viewer unread + viewer read cursor. Peer `readReceipt` is never written here.
 */
export function patchRoomReadStateInSnapshotCache(args: {
  roomId: string;
  viewerUserId: string;
  unreadCount: number;
  /** Viewer participant cursor — monotonic advance only when provided. */
  viewerLastReadMessageId?: string | null;
}): void {
  const roomId = args.roomId.trim();
  const viewerUserId = args.viewerUserId.trim();
  if (!roomId || !viewerUserId) return;
  const nextUnread = Math.max(0, Math.floor(args.unreadCount || 0));
  const nextCursor =
    args.viewerLastReadMessageId !== undefined
      ? String(args.viewerLastReadMessageId ?? "").trim() || null
      : undefined;
  const update = (snapshot: CommunityMessengerRoomSnapshot) => {
    const prevCursor =
      typeof snapshot.viewerLastReadMessageId === "string"
        ? snapshot.viewerLastReadMessageId.trim()
        : "";
    let viewerLastReadMessageId = snapshot.viewerLastReadMessageId ?? null;
    if (nextCursor !== undefined) {
      if (!nextCursor) {
        viewerLastReadMessageId = null;
      } else if (!prevCursor) {
        viewerLastReadMessageId = nextCursor;
      } else {
        const msgs = snapshot.messages ?? [];
        const prevIdx = msgs.findIndex((m) => m.id === prevCursor);
        const nextIdx = msgs.findIndex((m) => m.id === nextCursor);
        if (prevIdx < 0 || nextIdx < 0 || nextIdx > prevIdx) {
          viewerLastReadMessageId = nextCursor;
        }
      }
    }
    return {
      ...snapshot,
      room: { ...snapshot.room, unreadCount: nextUnread },
      viewerLastReadMessageId,
    } satisfies CommunityMessengerRoomSnapshot;
  };
  patchEntryMap(entries, roomId, viewerUserId, update);
  patchHotMap(roomId, viewerUserId, update);
}

export function consumeRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  const r = roomId.trim();
  if (!r) return null;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const k = cacheKey(r, viewerUserId.trim());
    const row = entries.get(k);
    if (!row || !isMessengerRoomBootstrapReadySnapshot(row.snapshot)) {
      if (row) entries.delete(k);
      return null;
    }
    entries.delete(k);
    return row.snapshot;
  }
  const suffix = `:${r}`;
  for (const k of Array.from(entries.keys())) {
    if (!k.endsWith(suffix)) continue;
    const row = entries.get(k);
    if (!row || !isMessengerRoomBootstrapReadySnapshot(row.snapshot)) {
      if (row) entries.delete(k);
      continue;
    }
    entries.delete(k);
    return row.snapshot;
  }
  return null;
}

export type PrefetchCommunityMessengerRoomSnapshotOpts = {
  /**
   * true: TTL 안의 기존 `peek` 이 있어도 무효화 후 다시 GET — 상대 신규 메시지 직후 입장 시 옛 타임라인 시드 방지.
   */
  force?: boolean;
};

/** 호버 등으로 미리 채워 두면 방 진입 시 로딩이 거의 없어짐. */
export async function prefetchCommunityMessengerRoomSnapshot(
  roomId: string,
  opts?: PrefetchCommunityMessengerRoomSnapshotOpts
): Promise<boolean> {
  const key = roomId.trim();
  if (!key) return false;
  const force = opts?.force === true;
  if (!force && wasRoomPrefetchRecentlySuccessful(key)) {
    prefetchTrace("prefetch_skip_recent_success", { roomIdSuffix: key.slice(-8) });
    return true;
  }
  const flightKey = `cm:prefetch-room-snapshot:${key}`;
  const inflight = getSingleFlightPromise<boolean>(flightKey);
  if (inflight) {
    prefetchTrace("prefetch_join_single_flight", { roomIdSuffix: key.slice(-8) });
    return inflight;
  }
  return runSingleFlight(flightKey, async () => {
    if (!force && !markRoomPrefetchAttempt(key)) {
      prefetchTrace("prefetch_skip_cooldown_or_inflight", { roomIdSuffix: key.slice(-8) });
      return false;
    }
    prefetchTrace("prefetch_flight_execute", { roomIdSuffix: key.slice(-8), force });
    if (!force && isRoomSnapshotFresh(key)) {
      prefetchTrace("prefetch_skip_fresh_inside_flight", { roomIdSuffix: key.slice(-8) });
      markRoomPrefetchComplete(key, true);
      return true;
    }
    if (force) invalidateRoomSnapshot(key);
    try {
      /**
       * 프리패치는 첫 화면용 경량 시드만 당겨온다.
       * 멤버 전체/2차 보강은 방 페이지 lifecycle 의 silent refresh 가 이어받는다.
       */
      prefetchTrace("prefetch_http_get", {
        roomIdSuffix: key.slice(-8),
        query: ROOM_PREFETCH_QUERY,
      });
      const res = await fetch(`${communityMessengerRoomBootstrapPath(key)}${ROOM_PREFETCH_QUERY}`, {
        cache: "default",
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      const snap = parseCommunityMessengerRoomSnapshotResponse(json);
      if (res.ok && snap) {
        lastPrefetchSuccessRoomId = key;
        lastPrefetchSuccessAt = Date.now();
        primeRoomSnapshot(key, snap);
        primeHotRoomSnapshot(key, snap);
        markRoomPrefetchComplete(key, true);
        return true;
      }
    } catch {
      // ignore
    }
    markRoomPrefetchComplete(key, false);
    return false;
  });
}
