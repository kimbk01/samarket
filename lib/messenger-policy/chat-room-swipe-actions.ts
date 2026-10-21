import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

/** @deprecated `MessengerChatListContext` 사용 권장 */
export type MessengerSwipeListContext = MessengerChatListContext;

/**
 * 스와이프 메뉴 자동 닫힘(무조작) — 버튼 2~3개를 읽고 고르는 1~2초 + 손가락 이동 여유.
 * 1차 닫힘 수단은 스크롤·외부 탭·다른 행이고 이 타이머는 보조 (Owner 확정 2026-10-21).
 */
export const MESSENGER_SWIPE_AUTO_CLOSE_MS = 5_000;

export type MessengerSwipeActionKind = "archive" | "read" | "leave";

export type MessengerSwipeActionDef = {
  kind: MessengerSwipeActionKind;
  labelKey: MessageKey;
  disabled: boolean;
};

/**
 * 채팅 목록 스와이프: 기본 3종(보관·읽음·나가기), 모임 탭은 카카오 오픈채팅형 2종(읽음·나가기).
 * `roomType`별로 나가기 비활성 등은 여기서만 결정한다.
 */
export function getSwipeActions(input: {
  policyType: MessengerPolicyRoomType;
  listContext: MessengerChatListContext;
  /** L-6·L-7: `resolveMessengerRoomLeaveAllowed` — false 면 「나가기」를 노출하지 않는다(실패 예정 버튼 금지) */
  leaveAllowed?: boolean;
  /** L-9: 운영 보관·삭제된 방은 「복원」이 아무 일도 하지 않으므로 숨긴다 */
  restoreAllowed?: boolean;
}): MessengerSwipeActionDef[] {
  const { listContext } = input;
  const leaveAllowed = input.leaveAllowed !== false;
  const leave: MessengerSwipeActionDef[] = leaveAllowed
    ? [{ kind: "leave", labelKey: "cm_ui_leave", disabled: false }]
    : [];
  if (listContext === "open_chat") {
    return [{ kind: "read", labelKey: "cm_ui_swipe_mark_read", disabled: false }, ...leave];
  }
  const isArchiveList = listContext === "archive";
  const archive: MessengerSwipeActionDef[] =
    isArchiveList && input.restoreAllowed === false
      ? []
      : [{ kind: "archive", labelKey: isArchiveList ? "cm_ui_swipe_restore" : "cm_ui_archive", disabled: false }];
  return [...archive, { kind: "read", labelKey: "cm_ui_swipe_mark_read", disabled: false }, ...leave];
}

/**
 * W2 채팅 종류별 나가기 허용 (서버 `leaveMessengerRoomUnified` 가 같은 규칙으로 최종 거부).
 * - 주문(store_order): 완료·취소된 주문만 (매장 사장님은 서버가 거부)
 * - 오픈그룹 방장: 위임 전에는 불가
 * - 1:1·비공개 그룹(자동 위임)·거래(원장 보존): 허용
 */
export function resolveMessengerRoomLeaveAllowed(input: {
  roomType: string;
  isStoreOrder: boolean;
  storeOrderClosed: boolean;
  ownerUserId: string | null | undefined;
  viewerUserId: string | null | undefined;
}): boolean {
  if (input.isStoreOrder) return input.storeOrderClosed;
  const viewer = input.viewerUserId?.trim();
  if (input.roomType === "open_group" && viewer && input.ownerUserId?.trim() === viewer) return false;
  return true;
}

export type MessengerSwipeLeaveConfirmKey =
  | "cm_ui_leave_confirm_trade"
  | "cm_ui_leave_confirm_group"
  | "cm_ui_leave_confirm_direct"
  | "cm_ui_leave_confirm_store_order";

/** 스와이프 나가기 확인 i18n key — room 정책별 (L-7: 주문 채팅은 「내 목록에서만 삭제」 문구가 사실과 달라 분리) */
export function getSwipeLeaveConfirmI18nKey(
  policyType: MessengerPolicyRoomType,
  opts?: { isStoreOrder?: boolean }
): MessengerSwipeLeaveConfirmKey {
  if (opts?.isStoreOrder) return "cm_ui_leave_confirm_store_order";
  if (policyType === "trade") return "cm_ui_leave_confirm_trade";
  if (policyType === "group") return "cm_ui_leave_confirm_group";
  return "cm_ui_leave_confirm_direct";
}
