/**
 * 모임 소유 방(owner_domain='moim')의 읽기 전용은 모임 함수만 바꾼다 (모임 R4 §5(c) · hard-lock 「MOIM-owned GROUP rooms」).
 * 메신저 어드민이 풀면 차단·종료·삭제된 모임 방이 다시 열린다 — DB 트리거가 막고, 어드민 경로는 같은 코드로 먼저 거부해
 * 「모임 어드민에서」 안내를 보인다 (안내 문구 키 `admin_cm_moim_room_readonly_managed_by_moim`).
 */
import type { MessageKey } from "@/lib/i18n/messages";

export const MOIM_ROOM_READONLY_MANAGED_BY_MOIM = "moim_room_readonly_managed_by_moim" as const;
export const MOIM_ROOM_READONLY_MANAGED_BY_MOIM_MESSAGE_KEY: MessageKey = "admin_cm_moim_room_readonly_managed_by_moim";
/** 상태가 바뀐 것(409 · 다시 불러오기)이 아니라 처리할 수 없는 요청이다 */
export const MOIM_ROOM_READONLY_MANAGED_BY_MOIM_STATUS = 422;

export function cmRoomAdminActionTouchesReadonly(action: string): boolean {
  return action === "readonly_on" || action === "readonly_off";
}

export function isMoimOwnedRoomRow(row: { owner_domain?: unknown } | null | undefined): boolean {
  return typeof row?.owner_domain === "string" && row.owner_domain.trim() === "moim";
}

/** 모임 방 + 읽기 전용 조치면 거부 */
export function rejectsMoimRoomReadonlyAction(row: { owner_domain?: unknown } | null | undefined, action: string): boolean {
  return cmRoomAdminActionTouchesReadonly(action) && isMoimOwnedRoomRow(row);
}
