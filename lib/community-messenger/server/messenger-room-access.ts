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
  /** fetchActiveParticipant 와 같은 조건(left_at·blocked_hidden_at null)의 행 */
  groupParticipant: GroupParticipantRow | null;
  /** 활성 강퇴(unbanned_at is null) */
  banned: boolean;
};

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
    group_participant?: unknown;
    banned?: unknown;
  };
  const gp = row.group_participant;
  return {
    roomId: rid,
    roomExists: row.room_exists === true,
    roomType: trimText(row.room_type),
    deleted: Boolean(trimText(row.deleted_at)),
    participantActive: row.participant_active === true,
    groupParticipant: gp && typeof gp === "object" ? (gp as GroupParticipantRow) : null,
    banned: row.banned === true,
  };
}
