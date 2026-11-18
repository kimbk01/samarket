/**
 * 1-B — 방 접근 확인 행을 `community_messenger_room_access` 1회로 읽는다.
 * 계획: docs/audit/messenger-room-check-fanout-fix-plan-2026-10-31.md 「1-B」.
 * 이 모듈은 행만 돌려준다 — 판정(참가·그룹 활성 멤버·삭제·강퇴)은 호출자가 기존 조건 그대로 한다.
 * null = 읽기 실패 → 호출자는 기존 개별 조회 경로를 그대로 탄다.
 */
import type { GroupParticipantRow } from "@/lib/community-messenger/group/group-room.types";

export type MessengerRoomAccessFacts = {
  roomId: string;
  roomExists: boolean;
  /** "" = 방 없음·알 수 없음 */
  roomType: string;
  deleted: boolean;
  /** participants(room_id,user_id) 이고 left_at is null */
  participantActive: boolean;
  /** 활성 참가 행 id (없으면 "") — B3 messages history floor 재사용 */
  participantId: string;
  /** 기록 하한 — B3 GET messages 가 participants 재조회 없이 씀 (미적용 DB면 null) */
  clearedAt: string | null;
  /** fetchActiveParticipant 와 같은 조건(left_at·blocked_hidden_at null)의 행 */
  groupParticipant: GroupParticipantRow | null;
  /** 활성 강퇴(unbanned_at is null) */
  banned: boolean;
};

/** B3 — access 가 활성 참가면 messages list 의 participants SELECT 대체 */
export function viewerParticipantPreflightFromAccess(
  access: MessengerRoomAccessFacts | null | undefined
): { id: string; cleared_at: string | null } | null {
  if (!access?.participantActive) return null;
  /**
   * `participant_id` 는 B3 마이그레이션(20261118180000) 적용 DB 의 room_access 만 준다 — 그때만 `cleared_at` 도 믿을 수 있다.
   * 미적용 DB 의 `group_participant.id` 로 대신 채우면 `cleared_at` 이 없어 null(하한 없음)로 넘어가
   * 「대화 내용 지우기」 이전 메시지가 다시 보인다 → null 을 돌려 participants 재조회(기존 경로)로 보낸다.
   */
  const id = trimText(access.participantId);
  if (!id) return null;
  return { id, cleared_at: access.clearedAt };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isMessengerGroupRoomType(roomType: string): boolean {
  return roomType === "private_group" || roomType === "open_group";
}

export async function loadMessengerRoomAccess(
  sb: unknown,
  userId: string,
  roomKey: string
): Promise<MessengerRoomAccessFacts | null> {
  const uid = trimText(userId);
  const rid = trimText(roomKey);
  if (!uid || !rid || !UUID_RE.test(uid)) return null;
  const { data, error } = await (sb as any).rpc("community_messenger_room_access", {
    p_user_id: uid,
    p_room_key: rid,
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as {
    room_exists?: unknown;
    room_type?: unknown;
    deleted_at?: unknown;
    participant_active?: unknown;
    participant_id?: unknown;
    cleared_at?: unknown;
    group_participant?: unknown;
    banned?: unknown;
  };
  const gp = row.group_participant;
  const clearedRaw = row.cleared_at;
  return {
    roomId: rid,
    roomExists: row.room_exists === true,
    roomType: trimText(row.room_type),
    deleted: Boolean(trimText(row.deleted_at)),
    participantActive: row.participant_active === true,
    participantId: trimText(row.participant_id),
    clearedAt: typeof clearedRaw === "string" && clearedRaw.trim() ? clearedRaw.trim() : null,
    groupParticipant: gp && typeof gp === "object" ? (gp as GroupParticipantRow) : null,
    banned: row.banned === true,
  };
}
