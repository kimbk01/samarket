import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 60_000;
const MAX_ENTRIES = 120;
const entries = new Map<string, { snapshot: CommunityMessengerRoomSnapshot; at: number }>();
/** 계측: 목록·호버 프리패치 — 방 클라 `createMessengerRoomBootstrapRefresh` GET 과 URL 로그에서 분리 */
const ROOM_PREFETCH_QUERY = "?mode=lite&memberHydration=minimal&cmReqSrc=list_prefetch";

/** 목록 프리패치 TTL과 별개 — 같은 방 재입장 시 `consume` 으로 지워지지 않게 유지(세션 내 소량 LRU) */
const HOT_MAX = 32;
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

function pruneIfNeeded(now = Date.now()): void {
  for (const [k, v] of entries) {
    if (now - v.at > TTL_MS) entries.delete(k);
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

export function primeRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot) {
  const k = cacheKey(roomId, snapshot.viewerUserId);
  entries.set(k, { snapshot, at: Date.now() });
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
  const k = cacheKey(roomId, snapshot.viewerUserId);
  if (hotEntries.has(k)) hotEntries.delete(k);
  hotEntries.set(k, snapshot);
  pruneHotIfNeeded();
}

export function peekHotRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  const r = roomId.trim();
  if (!r) return null;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    return hotEntries.get(cacheKey(r, viewerUserId.trim())) ?? null;
  }
  const suffix = `:${r}`;
  let found: CommunityMessengerRoomSnapshot | null = null;
  for (const [k, snap] of hotEntries) {
    if (!k.endsWith(suffix)) continue;
    found = snap;
    break;
  }
  return found;
}

/**
 * @param viewerUserId 현재 로그인 사용자 id. 생략·빈 문자열이면 동일 `roomId` 로 끝나는 캐시 중 **가장 최근** 항목을 반환(프리패치 히트용).
 */
export function peekRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  pruneIfNeeded();
  const r = roomId.trim();
  if (!r) return null;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const k = cacheKey(r, viewerUserId.trim());
    const row = entries.get(k);
    if (!row) return null;
    if (Date.now() - row.at > TTL_MS) {
      entries.delete(k);
      return null;
    }
    return row.snapshot;
  }
  const suffix = `:${r}`;
  let best: { snapshot: CommunityMessengerRoomSnapshot; at: number } | null = null;
  for (const [k, row] of entries) {
    if (!k.endsWith(suffix)) continue;
    if (Date.now() - row.at > TTL_MS) {
      entries.delete(k);
      continue;
    }
    if (!best || row.at > best.at) best = row;
  }
  return best?.snapshot ?? null;
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

export function patchRoomReadStateInSnapshotCache(args: {
  roomId: string;
  viewerUserId: string;
  unreadCount: number;
  lastReadMessageId?: string | null;
}): void {
  const roomId = args.roomId.trim();
  const viewerUserId = args.viewerUserId.trim();
  if (!roomId || !viewerUserId) return;
  const update = (snapshot: CommunityMessengerRoomSnapshot) =>
    ({
      ...snapshot,
      room: { ...snapshot.room, unreadCount: Math.max(0, Math.floor(args.unreadCount || 0)) },
      ...(args.lastReadMessageId !== undefined
        ? {
            readReceipt: {
              roomId,
              readerUserId: snapshot.readReceipt?.readerUserId ?? "",
              lastReadAt: snapshot.readReceipt?.lastReadAt ?? null,
              lastReadMessageId: args.lastReadMessageId ?? null,
            },
          }
        : null),
    } satisfies CommunityMessengerRoomSnapshot);
  patchEntryMap(entries, roomId, viewerUserId, update);
  patchHotMap(roomId, viewerUserId, update);
}

export function consumeRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  pruneIfNeeded();
  const r = roomId.trim();
  if (!r) return null;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const k = cacheKey(r, viewerUserId.trim());
    const row = entries.get(k);
    if (!row) return null;
    entries.delete(k);
    if (Date.now() - row.at > TTL_MS) return null;
    return row.snapshot;
  }
  const suffix = `:${r}`;
  for (const k of Array.from(entries.keys())) {
    if (!k.endsWith(suffix)) continue;
    const row = entries.get(k);
    if (!row) continue;
    entries.delete(k);
    if (Date.now() - row.at > TTL_MS) return null;
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
  return runSingleFlight(`cm:prefetch-room-snapshot:${key}`, async () => {
    if (!force && peekRoomSnapshot(key)) return true;
    if (force) invalidateRoomSnapshot(key);
    try {
      /**
       * 프리패치는 첫 화면용 경량 시드만 당겨온다.
       * 멤버 전체/2차 보강은 방 페이지 lifecycle 의 silent refresh 가 이어받는다.
       */
      const res = await fetch(`${communityMessengerRoomBootstrapPath(key)}${ROOM_PREFETCH_QUERY}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      const snap = parseCommunityMessengerRoomSnapshotResponse(json);
      if (res.ok && snap) {
        primeRoomSnapshot(key, snap);
        primeHotRoomSnapshot(key, snap);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  });
}
