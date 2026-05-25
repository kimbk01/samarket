/**
 * PATCH mark_read participant row — 짧은 TTL 스냅샷 + inflight 단일 SELECT.
 * `service.ts` 와 분리해 컴파일 그래프만 줄인다(런타임 의미 동일).
 */
/** `CommunityMessengerMarkReadDiag` 와 필드 정합 — service 순환 import 방지 */
export type MarkReadParticipantSnapshotDiag = {
  mark_read_snapshot_cache_key?: string;
  mark_read_existing_snapshot_cache_hit?: number;
  mark_read_existing_snapshot_reuse?: number;
  mark_read_existing_snapshot_singleflight_hit?: number;
  snapshot_cache_hit?: number;
  snapshot_request_local_hit?: number;
  snapshot_singleflight_hit?: number;
  snapshot_lookup_cache_hit?: 0 | 1;
  mark_read_fetch_existing_eliminated?: 0 | 1;
  fetch_existing_skipped?: 0 | 1;
  snapshot_source?: string;
};

export const MARK_READ_PARTICIPANT_SNAPSHOT_TTL_MS = (() => {
  const n = Number(process.env.SAMARKET_MARK_READ_PARTICIPANT_SNAPSHOT_TTL_MS);
  if (Number.isFinite(n) && n >= 200 && n <= 5000) return Math.floor(n);
  return 450;
})();

export type MarkReadParticipantSnapshot = {
  participantId: string;
  lastReadMessageId: string;
  lastReadAt: string | null;
  unreadCount: number;
};

const markReadParticipantSnapshotByKey = new Map<string, { expiresAt: number; snap: MarkReadParticipantSnapshot }>();
const markReadParticipantSnapshotInflight = new Map<string, Promise<MarkReadParticipantSnapshot | null>>();

function trimText(s: string): string {
  return s.trim();
}

function normalizeMessengerReadCursorKey(id: string): string {
  return trimText(id).toLowerCase();
}

function markReadParticipantBaseKey(userId: string, roomId: string): string {
  return `${trimText(userId)}\x00${trimText(roomId)}`;
}

/** 스냅샷 네임스페이스 — 커서 유무·flushOpen 조합 */
export function markReadSnapshotStorageKey(
  userId: string,
  roomId: string,
  requestedLastReadMessageId: string,
  flushOpen: boolean
): string {
  const base = markReadParticipantBaseKey(userId, roomId);
  const mid = trimText(requestedLastReadMessageId);
  if (mid) return `${base}\x02k:${normalizeMessengerReadCursorKey(mid)}`;
  if (flushOpen) return `${base}\x02k:__flush_open__`;
  return `${base}\x02k:__none__`;
}

function participantRowToMarkReadSnapshot(
  partRow: Record<string, unknown> | null | undefined
): MarkReadParticipantSnapshot | null {
  if (!partRow) return null;
  const participantId = trimText(String((partRow as { id?: unknown }).id ?? ""));
  const lastReadMessageId = trimText(String((partRow as { last_read_message_id?: unknown }).last_read_message_id ?? ""));
  const rawAt = (partRow as { last_read_at?: unknown }).last_read_at;
  const lastReadAt =
    typeof rawAt === "string" && rawAt.trim()
      ? rawAt.trim()
      : rawAt instanceof Date && !Number.isNaN(rawAt.getTime())
        ? rawAt.toISOString()
        : null;
  const unreadCount = Number((partRow as { unread_count?: unknown }).unread_count ?? 0) || 0;
  return { participantId, lastReadMessageId, lastReadAt, unreadCount };
}

function markReadSnapshotToParticipantRow(snap: MarkReadParticipantSnapshot): Record<string, unknown> {
  return {
    id: snap.participantId,
    last_read_message_id: snap.lastReadMessageId,
    last_read_at: snap.lastReadAt,
    unread_count: snap.unreadCount,
  };
}

function snapshotTtlHit(sn: MarkReadParticipantSnapshot, normReq: string): boolean {
  if (sn.unreadCount !== 0) return false;
  if (normReq) return normalizeMessengerReadCursorKey(sn.lastReadMessageId) === normReq;
  return true;
}

function rememberSnapshotKeys(keys: Iterable<string>, snap: MarkReadParticipantSnapshot): void {
  const exp = Date.now() + MARK_READ_PARTICIPANT_SNAPSHOT_TTL_MS;
  for (const k of keys) {
    markReadParticipantSnapshotByKey.set(k, { expiresAt: exp, snap });
  }
}

function markReadParticipantLatestKey(userId: string, roomId: string): string {
  return `${markReadParticipantBaseKey(userId, roomId)}\x02k:__latest__`;
}

/** RPC/legacy 성공·중복 스킵 후 스냅샷을 여러 키에 기록해 다음 요청 적중률을 올린다. */
export function storeMarkReadParticipantSnapshotsFromRow(
  userId: string,
  roomId: string,
  opts: { flushOpen: boolean; requestedLastReadMessageId: string },
  partRow: Record<string, unknown> | null | undefined
): void {
  const snap = participantRowToMarkReadSnapshot(partRow);
  if (!snap) return;
  const keys = new Set<string>();
  keys.add(markReadSnapshotStorageKey(userId, roomId, opts.requestedLastReadMessageId, opts.flushOpen));
  keys.add(markReadSnapshotStorageKey(userId, roomId, "", opts.flushOpen));
  keys.add(markReadParticipantLatestKey(userId, roomId));
  if (snap.lastReadMessageId) {
    keys.add(markReadSnapshotStorageKey(userId, roomId, snap.lastReadMessageId, false));
  }
  rememberSnapshotKeys(keys, snap);
}

function probeLatestParticipantSnapshot(
  userId: string,
  roomId: string
): MarkReadParticipantSnapshot | null {
  const ent = markReadParticipantSnapshotByKey.get(markReadParticipantLatestKey(userId, roomId));
  if (!ent || ent.expiresAt <= Date.now()) return null;
  return ent.snap;
}

/**
 * TTL 메모리만 조회 — cold open combined RPC 전 warm duplicate 판정용(네트워크 SELECT 없음).
 */
export function probeMarkReadParticipantSnapshotCacheOnly(
  userId: string,
  roomId: string,
  requestedLastReadMessageId: string,
  flushOpen: boolean
): MarkReadParticipantSnapshot | null {
  const normReq = requestedLastReadMessageId ? normalizeMessengerReadCursorKey(requestedLastReadMessageId) : "";
  const keysToProbe: string[] = [markReadSnapshotStorageKey(userId, roomId, requestedLastReadMessageId, flushOpen)];
  if (normReq && flushOpen) keysToProbe.push(markReadSnapshotStorageKey(userId, roomId, "", true));
  if (flushOpen && !normReq) keysToProbe.push(markReadSnapshotStorageKey(userId, roomId, "", true));

  const nowMs = Date.now();
  for (const fk of keysToProbe) {
    const ent = markReadParticipantSnapshotByKey.get(fk);
    if (!ent || ent.expiresAt <= nowMs) continue;
    if (normReq) {
      if (!snapshotTtlHit(ent.snap, normReq)) continue;
    } else if (flushOpen) {
      if (ent.snap.unreadCount !== 0) continue;
    }
    return ent.snap;
  }

  /** 커서 불일치·regression 판정 — room latest(unread 0) 로 compare-only fast-path */
  const latest = probeLatestParticipantSnapshot(userId, roomId);
  if (latest && latest.unreadCount === 0 && normReq) {
    return latest;
  }
  return null;
}

export async function loadMarkReadParticipantRowWithSnapshotCache(
  sb: any,
  userId: string,
  roomId: string,
  requestedLastReadMessageId: string,
  flushOpen: boolean,
  diag: MarkReadParticipantSnapshotDiag | undefined
): Promise<Record<string, unknown> | null> {
  const normReq = requestedLastReadMessageId ? normalizeMessengerReadCursorKey(requestedLastReadMessageId) : "";
  const primaryKey = markReadSnapshotStorageKey(userId, roomId, requestedLastReadMessageId, flushOpen);

  if (diag) {
    diag.mark_read_snapshot_cache_key = primaryKey.length > 220 ? primaryKey.slice(0, 220) : primaryKey;
  }

  const keysToProbe: string[] = [primaryKey];
  if (normReq && flushOpen) keysToProbe.push(markReadSnapshotStorageKey(userId, roomId, "", true));
  if (flushOpen && !normReq) keysToProbe.push(markReadSnapshotStorageKey(userId, roomId, "", true));

  const nowMs = Date.now();
  for (const fk of keysToProbe) {
    const ent = markReadParticipantSnapshotByKey.get(fk);
    if (!ent || ent.expiresAt <= nowMs) continue;
    if (normReq) {
      if (!snapshotTtlHit(ent.snap, normReq)) continue;
    } else if (flushOpen) {
      /** open_tail 반복 — unread 0 일 때만 TTL 적중(짧은 창, 신규 메시지는 다음 요청에서 SELECT) */
      if (ent.snap.unreadCount !== 0) continue;
    } else {
      continue;
    }
    if (diag) {
      diag.mark_read_existing_snapshot_cache_hit = 1;
      diag.mark_read_existing_snapshot_reuse = 1;
      diag.snapshot_cache_hit = 1;
      diag.snapshot_request_local_hit = 1;
      diag.snapshot_lookup_cache_hit = 1;
      diag.mark_read_fetch_existing_eliminated = 1;
      diag.fetch_existing_skipped = 1;
      diag.snapshot_source = "memory_snapshot";
    }
    return markReadSnapshotToParticipantRow(ent.snap);
  }

  const infl = markReadParticipantSnapshotInflight.get(primaryKey);
  if (infl) {
    if (diag) {
      diag.mark_read_existing_snapshot_singleflight_hit = 1;
      diag.snapshot_singleflight_hit = 1;
    }
    const snap = await infl;
    if (!snap) return null;
    return markReadSnapshotToParticipantRow(snap);
  }

  const flight = (async (): Promise<MarkReadParticipantSnapshot | null> => {
    const { data: partRow } = await sb
      .from("community_messenger_participants")
      .select("id, last_read_message_id, last_read_at, unread_count")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const r = partRow as Record<string, unknown> | null | undefined;
    const snap = participantRowToMarkReadSnapshot(r);
    if (snap) {
      rememberSnapshotKeys([primaryKey], snap);
    }
    return snap;
  })();

  markReadParticipantSnapshotInflight.set(primaryKey, flight);
  try {
    const snap = await flight;
    if (!snap) return null;
    return markReadSnapshotToParticipantRow(snap);
  } finally {
    markReadParticipantSnapshotInflight.delete(primaryKey);
  }
}

/** vitest — participant snapshot Map 초기화 */
export function resetMarkReadParticipantSnapshotCachesForTests(): void {
  markReadParticipantSnapshotByKey.clear();
  markReadParticipantSnapshotInflight.clear();
}
