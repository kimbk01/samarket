/**
 * 모임 소유 방(owner_domain='moim')의 방 상태(차단·보관)와 읽기 전용은 모임 함수만 바꾼다
 * (모임 R4 §5(c) · R5 D5 · Owner D-충돌 · hard-lock 「MOIM-owned GROUP rooms」).
 * 메신저 어드민이 바꾸면 차단·종료·삭제된 모임 방이 다시 열리거나, 운영 중 모임 방이 아무도 못 푸는 상태가 된다 — DB 트리거
 * `cm_moim_guard_rooms` 가 막고, 어드민 경로는 같은 코드로 먼저 거부해 「모임 어드민에서」 안내를 보인다
 * (안내 문구 키 `admin_cm_moim_room_managed_by_moim`). 메시지 숨김은 계약 §8 대로 메신저 어드민에서 할 수 있다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export const MOIM_ROOM_MANAGED_BY_MOIM = "moim_room_managed_by_moim" as const;
export const MOIM_ROOM_MANAGED_BY_MOIM_MESSAGE_KEY: MessageKey = "admin_cm_moim_room_managed_by_moim";
/** 상태가 바뀐 것(409 · 다시 불러오기)이 아니라 처리할 수 없는 요청이다 */
export const MOIM_ROOM_MANAGED_BY_MOIM_STATUS = 422;

/**
 * 옛 이름 (R4) — 아직 이 이름을 쓰는 라우트(`app/api/admin/chat/rooms/[id]/action`·`app/api/admin/community-messenger/rooms/[id]/action`)가
 * 새 코드·새 문구로 그대로 동작하도록 같은 값을 가리킨다. 새 코드는 위 이름만 쓴다.
 */
export const MOIM_ROOM_READONLY_MANAGED_BY_MOIM = MOIM_ROOM_MANAGED_BY_MOIM;
export const MOIM_ROOM_READONLY_MANAGED_BY_MOIM_MESSAGE_KEY: MessageKey = MOIM_ROOM_MANAGED_BY_MOIM_MESSAGE_KEY;
export const MOIM_ROOM_READONLY_MANAGED_BY_MOIM_STATUS = MOIM_ROOM_MANAGED_BY_MOIM_STATUS;

/** 모임 방에서 거부하는 메신저 어드민 방 조치 — 방 상태(차단·보관)와 읽기 전용 */
export const CM_ROOM_ACTIONS_MANAGED_BY_MOIM = ["block_room", "unblock_room", "archive_room", "unarchive_room", "readonly_on", "readonly_off"] as const;

export function cmRoomAdminActionManagedByMoim(action: string): boolean {
  return (CM_ROOM_ACTIONS_MANAGED_BY_MOIM as readonly string[]).includes(action);
}

export function isMoimOwnedRoomRow(row: { owner_domain?: unknown } | null | undefined): boolean {
  return typeof row?.owner_domain === "string" && row.owner_domain.trim() === "moim";
}

/** 모임 방 + 방 상태·읽기 전용 조치면 거부 (R5 D5) */
export function rejectsMoimRoomAdminAction(row: { owner_domain?: unknown } | null | undefined, action: string): boolean {
  return cmRoomAdminActionManagedByMoim(action) && isMoimOwnedRoomRow(row);
}
