/**
 * 방 진입·읽음 직후 서버보다 앞선 “로컬 읽음” 상태 — silent_delta / home-sync / seed 가 stale unread 로 되살리지 못하게 한다.
 * DB·RPC 변경 없음.
 *
 * CONTRACT (2026-07-23): wall-clock TTL alone must NOT re-admit stale unread>0.
 * Watermark = referenceLastMessageAt; only a newer lastMessageAt clears the guard.
 * DO NOT: restore TTL-forced allow · Domain DTO · Native Call.
 */

export type LocalReadGuardSource = "room_enter" | "manual" | "server_ack" | "bus_sync";

type GuardRow = {
  readAtMs: number;
  readAtIso: string;
  referenceLastMessageAt: string;
  source: LocalReadGuardSource;
  /** Soft meta only — does not force-allow stale unread after this time. */
  expireAtMs: number;
};

/** 정렬 키는 messenger-realtime-store 의 normalizeRoomId 와 동일 */
export function normalizeLocalReadGuardRoomId(roomId: string | null | undefined): string {
  return String(roomId ?? "")
    .trim()
    .toLowerCase();
}

const guards = new Map<string, GuardRow>();

/**
 * Soft window for server_ack refresh bookkeeping.
 * Stale unread suppress no longer ends when this elapses (high-water lastMessageAt wins).
 */
export const LOCAL_READ_GUARD_TTL_MS = 20_000;

/** Memory GC only — not a stale-unread admit gate. */
export const LOCAL_READ_GUARD_HARD_GC_MS = 24 * 60 * 60 * 1000;

function trimIso(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** incoming 활동이 가드 시점보다 새로운지 — lastMessageAt 문자열(ISO) 비교 */
export function incomingLastMessageIsAfterReference(referenceLastMessageAt: string, incomingLastMessageAt: string): boolean {
  const a = trimIso(referenceLastMessageAt);
  const b = trimIso(incomingLastMessageAt);
  if (!b) return false;
  if (!a) return true;
  return b.localeCompare(a) > 0;
}

/** Hard GC only — TTL soft-expire does not delete the watermark. */
export function clearExpiredLocalReadGuards(now = Date.now()): void {
  for (const [k, v] of guards) {
    if (now - v.readAtMs >= LOCAL_READ_GUARD_HARD_GC_MS) guards.delete(k);
  }
}

export function setLocalReadGuard(input: {
  roomId: string;
  referenceLastMessageAt: string;
  source: LocalReadGuardSource;
  ttlMs?: number;
}): void {
  const rid = normalizeLocalReadGuardRoomId(input.roomId);
  if (!rid) return;
  const now = Date.now();
  const ttl = typeof input.ttlMs === "number" && Number.isFinite(input.ttlMs) && input.ttlMs > 0 ? input.ttlMs : LOCAL_READ_GUARD_TTL_MS;
  guards.set(rid, {
    readAtMs: now,
    readAtIso: new Date(now).toISOString(),
    referenceLastMessageAt: trimIso(input.referenceLastMessageAt),
    source: input.source,
    expireAtMs: now + ttl,
  });
}

/** PATCH mark_read 성공 후 soft window 연장·출처 갱신 (stale admit 게이트 아님) */
export function refreshLocalReadGuardServerAck(roomId: string): void {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  const row = guards.get(rid);
  if (!row) return;
  const now = Date.now();
  guards.set(rid, {
    ...row,
    source: "server_ack",
    readAtMs: now,
    readAtIso: new Date(now).toISOString(),
    expireAtMs: now + LOCAL_READ_GUARD_TTL_MS,
  });
}

export function shouldSuppressStaleUnread(args: {
  roomId: string;
  incomingUnread: number;
  incomingLastMessageAt: string;
}): boolean {
  clearExpiredLocalReadGuards();
  const rid = normalizeLocalReadGuardRoomId(args.roomId);
  const row = guards.get(rid);
  if (!row) return false;
  const unread = Math.max(0, Math.floor(Number(args.incomingUnread) || 0));
  if (unread <= 0) return false;
  if (incomingLastMessageIsAfterReference(row.referenceLastMessageAt, args.incomingLastMessageAt)) {
    guards.delete(rid);
    return false;
  }
  return true;
}

/** 최종 unread — 억제 시 0, 신규 활동이면 서버값 */
export function resolveUnreadWithLocalReadGuard(args: {
  roomId: string;
  incomingUnread: number;
  incomingLastMessageAt: string;
}): { unreadCount: number; suppressed: boolean; allowedNewMessage: boolean } {
  clearExpiredLocalReadGuards();
  const rid = normalizeLocalReadGuardRoomId(args.roomId);
  const row = guards.get(rid);
  const unreadIn = Math.max(0, Math.floor(Number(args.incomingUnread) || 0));
  if (!row) {
    return { unreadCount: unreadIn, suppressed: false, allowedNewMessage: false };
  }
  const newer = incomingLastMessageIsAfterReference(row.referenceLastMessageAt, args.incomingLastMessageAt);
  if (newer) {
    guards.delete(rid);
    return { unreadCount: unreadIn, suppressed: false, allowedNewMessage: true };
  }
  if (unreadIn <= 0) return { unreadCount: 0, suppressed: false, allowedNewMessage: false };
  return { unreadCount: 0, suppressed: true, allowedNewMessage: false };
}

export function cmReadBadgeLog(event: string, payload: Record<string, unknown>): void {
  if (typeof process === "undefined") return;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_CM_READ_BADGE_DEBUG !== "1") return;
  // eslint-disable-next-line no-console
  console.info("[cm-read-badge]", event, payload);
}

/** Clear one room guard — participant RT unread>0 admits new activity (empty LMA must not suppress). */
export function clearLocalReadGuard(roomId: string): void {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  if (!rid) return;
  guards.delete(rid);
}

/** Vitest 등 — 프로덕션에서 호출하지 않는다 */
export function clearLocalReadGuardsForTests(): void {
  guards.clear();
}

/** @internal vitest — soft TTL elapsed without clearing watermark */
export function __forceLocalReadGuardSoftExpiredForTest(roomId: string, now = Date.now()): void {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  const row = guards.get(rid);
  if (!row) return;
  guards.set(rid, { ...row, expireAtMs: now - 1 });
}

/** @internal vitest — age past hard GC */
export function __forceLocalReadGuardHardGcAgeForTest(roomId: string, now = Date.now()): void {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  const row = guards.get(rid);
  if (!row) return;
  guards.set(rid, { ...row, readAtMs: now - LOCAL_READ_GUARD_HARD_GC_MS - 1 });
}
