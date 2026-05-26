/**
 * PATCH mark_read duplicate/open ack — snapshot·order cache fast-path (DB fetch/compare 생략).
 * @see docs/messenger-mark-read-performance-lock.md
 */
import type { CommunityMessengerMarkReadDiag, CommunityMessengerMarkReadResult } from "@/lib/community-messenger/service";
import {
  markReadSnapshotStorageKey,
  probeMarkReadParticipantSnapshotCacheOnly,
  type MarkReadParticipantSnapshot,
} from "@/lib/community-messenger/mark-read-participant-snapshot";
import { rememberMarkReadOpenTailCoalesce } from "@/lib/community-messenger/mark-read-open-tail-coalesce";

function trimText(s: string): string {
  return s.trim();
}

function normalizeMessengerReadCursorKey(id: string): string {
  return trimText(id).toLowerCase();
}

function messageOrderCacheKey(roomId: string, messageId: string): string {
  return `${trimText(roomId).toLowerCase()}\x00${normalizeMessengerReadCursorKey(messageId)}`;
}

const markReadMessageOrderByKey = new Map<string, string>();

/** 장시간 세션에서 order 캐시 무한 성장 방지 — trade·CM read fast-path 공용 */
const MARK_READ_MESSAGE_ORDER_CACHE_MAX = 4_000;

function pruneMarkReadMessageOrderCache(): void {
  if (markReadMessageOrderByKey.size <= MARK_READ_MESSAGE_ORDER_CACHE_MAX) return;
  const drop = markReadMessageOrderByKey.size - MARK_READ_MESSAGE_ORDER_CACHE_MAX;
  let i = 0;
  for (const k of markReadMessageOrderByKey.keys()) {
    markReadMessageOrderByKey.delete(k);
    i += 1;
    if (i >= drop) break;
  }
}

/** compare/RPC 후 message created_at 캐시 — 동일 room 반복 compare DB 생략 */
export function rememberMarkReadMessageOrderFromRows(
  roomId: string,
  rows: Array<{ id?: unknown; created_at?: unknown }>
): void {
  const rid = trimText(roomId);
  if (!rid) return;
  for (const row of rows) {
    const id = normalizeMessengerReadCursorKey(trimText(String(row.id ?? "")));
    if (!id) continue;
    const raw = row.created_at;
    const iso =
      typeof raw === "string" && raw.trim()
        ? raw.trim()
        : raw instanceof Date && !Number.isNaN(raw.getTime())
          ? raw.toISOString()
          : "";
    if (iso) {
      markReadMessageOrderByKey.set(messageOrderCacheKey(rid, id), iso);
      pruneMarkReadMessageOrderCache();
    }
  }
}

export function compareMarkReadCursorOrderFromCache(
  roomId: string,
  storedMessageId: string,
  requestedMessageId: string
): "regression" | "advance" | "same" | "unknown" {
  if (normalizeMessengerReadCursorKey(storedMessageId) === normalizeMessengerReadCursorKey(requestedMessageId)) {
    return "same";
  }
  const rid = trimText(roomId);
  const aRaw = markReadMessageOrderByKey.get(messageOrderCacheKey(rid, requestedMessageId));
  const bRaw = markReadMessageOrderByKey.get(messageOrderCacheKey(rid, storedMessageId));
  if (!aRaw || !bRaw) return "unknown";
  const a = Date.parse(aRaw);
  const b = Date.parse(bRaw);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "unknown";
  if (a < b) return "regression";
  if (a > b) return "advance";
  return "same";
}

export async function compareMessengerReadCursorOrderCached(
  sb: unknown,
  roomId: string,
  storedMessageId: string,
  requestedMessageId: string
): Promise<"regression" | "advance" | "same" | "unknown"> {
  const cached = compareMarkReadCursorOrderFromCache(roomId, storedMessageId, requestedMessageId);
  if (cached !== "unknown") return cached;

  const client = sb as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (col: string, vals: string[]) => Promise<{ data: unknown }>;
        };
      };
    };
  };
  const { data: rows } = await client
    .from("community_messenger_messages")
    .select("id, created_at")
    .eq("room_id", roomId)
    .in("id", [storedMessageId, requestedMessageId]);
  const list = (rows ?? []) as Array<{ id?: unknown; created_at?: unknown }>;
  rememberMarkReadMessageOrderFromRows(roomId, list);
  return compareMarkReadCursorOrderFromCache(roomId, storedMessageId, requestedMessageId);
}

function duplicateResultFromSnapshot(
  snap: MarkReadParticipantSnapshot,
  requestedLastReadMessageId: string,
  opts: {
    regressionBlocked?: boolean;
    sameLastReadDetected?: boolean;
  }
): CommunityMessengerMarkReadResult {
  const normReq = requestedLastReadMessageId ? normalizeMessengerReadCursorKey(requestedLastReadMessageId) : "";
  return {
    ok: true,
    lastReadAt: snap.lastReadAt,
    lastReadMessageId: normReq ? requestedLastReadMessageId : snap.lastReadMessageId || null,
    duplicateAckSkipped: true,
    broadcastSkipped: true,
    sameLastReadDetected: opts.sameLastReadDetected !== false,
    lastReadAdvanced: false,
    regressionBlocked: opts.regressionBlocked === true,
  };
}

function applyDuplicateFastPathDiag(
  diag: CommunityMessengerMarkReadDiag | undefined,
  snapshotSource: "memory_snapshot" | "request_local"
): void {
  if (!diag) return;
  diag.duplicate_fast_path = 1;
  diag.fetch_existing_skipped = 1;
  diag.snapshot_source = snapshotSource;
  diag.mark_read_fetch_existing_eliminated = 1;
  diag.mark_read_fetch_existing_ms = 0;
  diag.existing_read_fetch_ms = 0;
  diag.mark_read_compare_ms = 0;
  diag.message_order_compare_ms = 0;
  diag.mark_read_duplicate_skip_eval_ms = 0;
  diag.mark_read_db_update_ms = 0;
  diag.mark_read_db_round_trips = 0;
  diag.snapshot_cache_hit = 1;
  diag.snapshot_lookup_cache_hit = 1;
  diag.mark_read_existing_snapshot_cache_hit = 1;
  diag.mark_read_existing_snapshot_reuse = 1;
  diag.snapshot_request_local_hit = snapshotSource === "request_local" ? 1 : 0;
}

function evaluateSnapshotDuplicateAck(
  userId: string,
  roomId: string,
  snap: MarkReadParticipantSnapshot,
  requestedLastReadMessageId: string,
  flushOpen: boolean,
  diag: CommunityMessengerMarkReadDiag | undefined
): CommunityMessengerMarkReadResult | null {
  const normReq = requestedLastReadMessageId ? normalizeMessengerReadCursorKey(requestedLastReadMessageId) : "";
  const normExist = snap.lastReadMessageId ? normalizeMessengerReadCursorKey(snap.lastReadMessageId) : "";
  const unread = snap.unreadCount;

  if (diag) {
    diag.mark_read_snapshot_cache_key = markReadSnapshotStorageKey(
      userId,
      roomId,
      requestedLastReadMessageId,
      flushOpen
    ).slice(0, 220);
  }

  const duplicateSameReadState =
    Boolean(normReq && normExist && normReq === normExist && unread === 0) ||
    Boolean(flushOpen && !normReq && unread === 0 && Boolean(normExist));

  if (duplicateSameReadState) {
    applyDuplicateFastPathDiag(diag, "memory_snapshot");
    return duplicateResultFromSnapshot(snap, requestedLastReadMessageId, { sameLastReadDetected: true });
  }

  if (normReq && normExist && normReq !== normExist && unread === 0) {
    const ord = compareMarkReadCursorOrderFromCache(roomId, snap.lastReadMessageId, requestedLastReadMessageId);
    if (ord === "same") {
      applyDuplicateFastPathDiag(diag, "memory_snapshot");
      return duplicateResultFromSnapshot(snap, requestedLastReadMessageId, { sameLastReadDetected: true });
    }
    if (ord === "regression") {
      applyDuplicateFastPathDiag(diag, "memory_snapshot");
      return duplicateResultFromSnapshot(snap, requestedLastReadMessageId, {
        regressionBlocked: true,
        sameLastReadDetected: false,
      });
    }
  }

  return null;
}

/**
 * fetch_existing / DB compare 전 — TTL participant snapshot 으로 duplicate·regression 판정.
 */
export function probeMarkReadEarlyDuplicateFastPath(input: {
  userId: string;
  roomId: string;
  requestedLastReadMessageId: string;
  flushOpen: boolean;
  membershipCacheHit?: 0 | 1;
  diag?: CommunityMessengerMarkReadDiag;
}): CommunityMessengerMarkReadResult | null {
  const { userId, roomId, requestedLastReadMessageId, flushOpen, diag } = input;
  if (diag && input.membershipCacheHit === 1) {
    diag.membership_cache_hit = 1;
  }

  const snap = probeMarkReadParticipantSnapshotCacheOnly(
    userId,
    roomId,
    requestedLastReadMessageId,
    flushOpen
  );
  if (!snap) return null;

  const evaluated = evaluateSnapshotDuplicateAck(userId, roomId, snap, requestedLastReadMessageId, flushOpen, diag);
  if (!evaluated) return null;

  if (flushOpen && !trimText(requestedLastReadMessageId)) {
    rememberMarkReadOpenTailCoalesce(userId, roomId, snap.lastReadAt, snap.lastReadMessageId);
  }
  return evaluated;
}

/** 테스트·캐시 초기화 */
export function resetMarkReadDuplicateFastPathCachesForTests(): void {
  markReadMessageOrderByKey.clear();
}
