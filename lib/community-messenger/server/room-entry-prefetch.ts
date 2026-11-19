/**
 * D4 ②③ 2단계 (Owner 「②③ 승인」 2026-11-19 · 그림자 일치 확인 후 전환) — 방 진입(bootstrap critical)을 DB 함수 1번으로.
 *
 * 라우트가 `community_messenger_room_entry` 를 1번 부르고, 같은 요청 안의 기존 호출 지점 4곳이 미리 받은 값을 쓴다:
 *   권한(room_access) · 방 스냅샷 RPC · 1:1 관계(direct_pair_facts) · 그룹 접속 원본(참가자·강퇴·접속)
 * 판정·가공 코드는 그대로. 값이 없거나 조건(사용자·방·메시지 수)이 다르면 기존처럼 각자 조회 → 결과 동일.
 * 동일 근거: 운영 rollback 60/60 · 적용 후 20/20 · 그림자 [room-entry-shadow] 운영 표본(11-19).
 */

export type RoomEntryRpcResult = {
  access?: unknown;
  snapshot?: unknown;
  pair_facts_by_peer?: Record<string, unknown> | null;
  group_online?: { active_user_ids?: unknown; banned_user_ids?: unknown; presence_rows?: unknown } | null;
};

export type RoomEntryPrefetch = {
  userId: string;
  roomKey: string;
  /** DB 함수와 같은 규칙으로 1~30 으로 자른 값 */
  messageLimitClamped: number;
  entry: RoomEntryRpcResult;
};

type AlsLike<T> = { run<R>(store: T, fn: () => R): R; getStore(): T | undefined; enterWith?: (store: T) => void };
const g = globalThis as { __samarketRoomEntryPrefetchAls?: AlsLike<RoomEntryPrefetch> | null };
function als(): AlsLike<RoomEntryPrefetch> | null {
  if (g.__samarketRoomEntryPrefetchAls === undefined) {
    const Ctor = (globalThis as { AsyncLocalStorage?: new () => AlsLike<RoomEntryPrefetch> }).AsyncLocalStorage;
    g.__samarketRoomEntryPrefetchAls = typeof Ctor === "function" ? new Ctor() : null;
  }
  return g.__samarketRoomEntryPrefetchAls;
}

/** `get_community_messenger_room_bootstrap_snapshot` 의 `least(greatest(coalesce(limit,24),1),30)` 와 같음 */
export function clampRoomSnapshotMessageLimit(limit: number | null | undefined): number {
  const n = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 24;
  return Math.min(Math.max(n, 1), 30);
}

export function runWithRoomEntryPrefetch<R>(prefetch: RoomEntryPrefetch | null, fn: () => R): R {
  const a = als();
  if (!prefetch || !a) return fn();
  return a.run(prefetch, fn);
}

/**
 * 이 요청의 남은 비동기 흐름에 미리 받은 값을 건다(라우트 중간에서 쓰기 위해 — Node AsyncLocalStorage.enterWith).
 * 쓸 수 없으면 false → 기존 경로.
 */
export function enterRoomEntryPrefetch(prefetch: RoomEntryPrefetch | null): boolean {
  const a = als();
  if (!prefetch || !a || typeof a.enterWith !== "function") return false;
  a.enterWith(prefetch);
  return true;
}

function current(): RoomEntryPrefetch | undefined {
  try {
    return als()?.getStore();
  } catch {
    return undefined;
  }
}

export function hasActiveRoomEntryPrefetch(): boolean {
  return Boolean(current());
}

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function takePrefetchedRoomAccess(userId: string, roomKey: string): unknown | undefined {
  const p = current();
  if (!p || p.userId !== t(userId) || p.roomKey !== t(roomKey)) return undefined;
  return p.entry.access && typeof p.entry.access === "object" ? p.entry.access : undefined;
}

export function takePrefetchedRoomSnapshot(userId: string, roomId: string, messageLimit: number): unknown | undefined {
  const p = current();
  if (!p || p.userId !== t(userId) || p.roomKey !== t(roomId)) return undefined;
  if (clampRoomSnapshotMessageLimit(messageLimit) !== p.messageLimitClamped) return undefined;
  return p.entry.snapshot ?? undefined;
}

export function takePrefetchedPairFacts(viewerUserId: string, peerUserId: string, roomId: string): unknown | undefined {
  const p = current();
  if (!p || p.userId !== t(viewerUserId) || p.roomKey !== t(roomId)) return undefined;
  const facts = p.entry.pair_facts_by_peer?.[t(peerUserId)];
  return facts && typeof facts === "object" ? facts : undefined;
}

export type PrefetchedGroupOnline = {
  activeUserIds: string[];
  bannedUserIds: string[];
  presenceRows: Array<Record<string, unknown>>;
};

export function takePrefetchedGroupOnline(roomId: string): PrefetchedGroupOnline | undefined {
  const p = current();
  if (!p || p.roomKey !== t(roomId) || !p.entry.group_online) return undefined;
  const go = p.entry.group_online;
  const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => t(x)).filter(Boolean) : []);
  return {
    activeUserIds: ids(go.active_user_ids),
    bannedUserIds: ids(go.banned_user_ids),
    presenceRows: Array.isArray(go.presence_rows) ? (go.presence_rows as Array<Record<string, unknown>>) : [],
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 방 진입 DB 함수 1번. uuid 방 키가 아니거나 함수 오류면 null → 기존 경로 */
export async function loadRoomEntryPrefetch(
  sb: unknown,
  userId: string,
  roomKey: string,
  messageLimit: number
): Promise<RoomEntryPrefetch | null> {
  const uid = t(userId);
  const rid = t(roomKey);
  if (!sb || !uid || !UUID_RE.test(rid)) return null;
  const clamped = clampRoomSnapshotMessageLimit(messageLimit);
  try {
    const { data, error } = await (
      sb as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> }
    ).rpc("community_messenger_room_entry", { p_user_id: uid, p_room_key: rid, p_message_limit: clamped });
    if (error || !data || typeof data !== "object") return null;
    return { userId: uid, roomKey: rid, messageLimitClamped: clamped, entry: data as RoomEntryRpcResult };
  } catch {
    return null;
  }
}
