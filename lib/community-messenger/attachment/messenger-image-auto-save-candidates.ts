/**
 * 미디어 자동 저장 — 후보(받은 사진 메시지) 계약. 서버 라우트·클라이언트 훅 공용 순수 모듈("use client" 아님).
 *
 * - 서버: `GET /api/community-messenger/media/auto-save-candidates?since=<ISO>` 가
 *   `listMessengerImageAutoSaveCandidates` 로 시청자가 **활성 참여 중(left_at null)** 인 방의
 *   받은 사진(sender ≠ viewer, created_at ≥ since, 삭제 안 됨)을 created_at 오름차순 최대 50건 반환.
 * - 클라이언트: 같은 매퍼(`messengerAutoSaveMessageFromRow`)로 Realtime 버스 행도 변환 →
 *   `autoSaveIncomingMessengerImages` 하나로 합류(원장·inflight 로 출처 간 중복 저장 없음).
 */
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

export const MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_LIMIT = 50;
/** 기준 시각이 오래돼도 이 기간 이전은 조회하지 않는다(쿼리 상한·대량 저장 방지). */
export const MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** 참여 방 상한 — PostgREST `in.(…)` URL 길이 때문에 청크로 나눠 조회. */
export const MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_ROOMS = 300;
export const MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_ROOM_CHUNK = 100;

export const MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_PATH = "/api/community-messenger/media/auto-save-candidates";

export const MESSENGER_IMAGE_AUTO_SAVE_CANDIDATE_MESSAGE_COLUMNS =
  "id, room_id, sender_id, message_type, content, metadata, created_at, deleted_at, deleted_for_everyone_at, is_hidden_by_admin";

export type MessengerImageAutoSaveCandidatesResponse = {
  ok: true;
  since: string;
  messages: CommunityMessengerMessage[];
  hasMore: boolean;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * `since` 파싱 — 잘못되었거나 없으면 null(라우트 400). 미래 시각은 now 로, 너무 오래된 값은 now-7일로 자른다.
 */
export function normalizeMessengerImageAutoSaveSince(raw: unknown, nowMs: number): string | null {
  const s = trimText(raw);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const clamped = Math.min(nowMs, Math.max(t, nowMs - MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_LOOKBACK_MS));
  return new Date(clamped).toISOString();
}

export type MessengerAutoSaveParticipantRow = {
  room_id?: unknown;
  left_at?: unknown;
  cleared_at?: unknown;
  blocked_hidden_at?: unknown;
};

/**
 * 후보 방 선별 — 활성 참여(left_at null)만, 차단 숨김 방 제외. 방별 cleared_at(대화 지우기) 반환.
 * 순수 함수(테스트 대상).
 */
export function selectMessengerAutoSaveCandidateRooms(
  rows: ReadonlyArray<MessengerAutoSaveParticipantRow>,
  maxRooms = MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_ROOMS,
): { roomIds: string[]; clearedAtMsByRoom: Map<string, number> } {
  const roomIds: string[] = [];
  const seen = new Set<string>();
  const clearedAtMsByRoom = new Map<string, number>();
  for (const r of rows) {
    const roomId = trimText(r.room_id);
    if (!roomId || seen.has(roomId)) continue;
    if (r.left_at != null && trimText(r.left_at)) continue;
    if (r.blocked_hidden_at != null && trimText(r.blocked_hidden_at)) continue;
    seen.add(roomId);
    roomIds.push(roomId);
    const cleared = Date.parse(trimText(r.cleared_at));
    if (Number.isFinite(cleared)) clearedAtMsByRoom.set(roomId, cleared);
    if (roomIds.length >= maxRooms) break;
  }
  return { roomIds, clearedAtMsByRoom };
}

export function chunkMessengerAutoSaveRoomIds(
  roomIds: ReadonlyArray<string>,
  size = MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_ROOM_CHUNK,
): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < roomIds.length; i += size) out.push(roomIds.slice(i, i + size));
  return out;
}

/** 쿼리 빌더 최소 인터페이스 — 실제 PostgREST 빌더와 테스트용 가짜 빌더 모두 만족. */
export type MessengerAutoSaveQueryBuilder<Q> = {
  select(columns: string): Q;
  in(column: string, values: string[]): Q;
  eq(column: string, value: unknown): Q;
  neq(column: string, value: unknown): Q;
  is(column: string, value: null): Q;
  gte(column: string, value: string): Q;
  order(column: string, opts: { ascending: boolean }): Q;
  limit(n: number): Q;
};

/**
 * 메시지 후보 쿼리 조립 — room_media_idx(room_id, created_at) WHERE image/file AND deleted_at IS NULL 를 탄다.
 * `limit + 1` 로 hasMore 판정.
 */
export function buildMessengerAutoSaveCandidatesQuery<Q extends MessengerAutoSaveQueryBuilder<Q>>(
  from: Q,
  input: { roomIds: string[]; viewerUserId: string; sinceIso: string; limit?: number },
): Q {
  const limit = input.limit ?? MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_LIMIT;
  return from
    .select(MESSENGER_IMAGE_AUTO_SAVE_CANDIDATE_MESSAGE_COLUMNS)
    .in("room_id", input.roomIds)
    .eq("message_type", "image")
    .is("deleted_at", null)
    .is("deleted_for_everyone_at", null)
    .neq("sender_id", input.viewerUserId)
    .gte("created_at", input.sinceIso)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
}

/**
 * 서버 결과 2차 필터(방어) + 정렬 + 상한. 순수 함수(테스트 대상).
 * sender = viewer · 삭제 · 관리자 숨김 · since 이전 · 방 cleared_at 이전 · 비이미지 제외.
 */
export function filterMessengerAutoSaveCandidateRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  input: {
    viewerUserId: string;
    sinceMs: number;
    allowedRoomIds: ReadonlySet<string>;
    clearedAtMsByRoom?: ReadonlyMap<string, number>;
    limit?: number;
  },
): { rows: Record<string, unknown>[]; hasMore: boolean } {
  const limit = input.limit ?? MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_LIMIT;
  const viewer = input.viewerUserId.trim();
  const seen = new Set<string>();
  const kept: Array<{ row: Record<string, unknown>; t: number; id: string }> = [];
  for (const row of rows) {
    const id = trimText(row.id);
    const roomId = trimText(row.room_id);
    if (!id || !roomId || seen.has(id)) continue;
    if (!input.allowedRoomIds.has(roomId)) continue;
    if (row.message_type !== "image") continue;
    const sender = trimText(row.sender_id);
    if (!sender || sender === viewer) continue;
    if (trimText(row.deleted_at) || trimText(row.deleted_for_everyone_at)) continue;
    if (row.is_hidden_by_admin === true) continue;
    const t = Date.parse(trimText(row.created_at));
    if (!Number.isFinite(t) || t < input.sinceMs) continue;
    const cleared = input.clearedAtMsByRoom?.get(roomId);
    if (cleared !== undefined && t <= cleared) continue;
    seen.add(id);
    kept.push({ row, t, id });
  }
  kept.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rows: kept.slice(0, limit).map((k) => k.row), hasMore: kept.length > limit };
}

/**
 * DB/Realtime 행 → 자동 저장 입력 메시지(이미지 원본 필드 포함). 이미지가 아니거나 필수 필드가 없으면 null.
 * `isMine` 은 sender 로 판정(뷰어가 주어졌을 때).
 */
export function messengerAutoSaveMessageFromRow(
  row: Record<string, unknown> | null | undefined,
  viewerUserId?: string,
): CommunityMessengerMessage | null {
  if (!row || typeof row !== "object") return null;
  const id = trimText(row.id);
  const roomId = trimText(row.room_id);
  if (!id || !roomId || row.message_type !== "image") return null;
  const createdAt = trimText(row.created_at);
  if (!createdAt) return null;
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const content = typeof row.content === "string" ? row.content : "";
  const senderId = trimText(row.sender_id) || null;
  const viewer = viewerUserId?.trim() ?? "";
  const deletedForEveryoneAt = trimText(row.deleted_for_everyone_at) || null;
  return {
    id,
    roomId,
    senderId,
    senderLabel: "",
    messageType: "image",
    content,
    createdAt,
    metadata,
    isMine: Boolean(viewer && senderId && senderId === viewer),
    ...(deletedForEveryoneAt ? { deletedForEveryoneAt } : {}),
    ...messengerImageClientFieldsFromMetadata("image", metadata, content),
  } as CommunityMessengerMessage;
}
