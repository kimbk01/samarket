import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

/** @deprecated `MessengerChatListContext` 사용 권장 */
export type MessengerSwipeListContext = MessengerChatListContext;

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
}): MessengerSwipeActionDef[] {
  void input.policyType;
  const { listContext } = input;
  if (listContext === "open_chat") {
    return [
      { kind: "read", labelKey: "cm_ui_swipe_mark_read", disabled: false },
      { kind: "leave", labelKey: "cm_ui_leave", disabled: false },
    ];
  }
  const archiveLabelKey = listContext === "archive" ? "cm_ui_swipe_restore" : "cm_ui_archive";
  return [
    { kind: "archive", labelKey: archiveLabelKey, disabled: false },
    { kind: "read", labelKey: "cm_ui_swipe_mark_read", disabled: false },
    { kind: "leave", labelKey: "cm_ui_leave", disabled: false },
  ];
}

export type MessengerSwipeLeaveConfirmKey =
  | "cm_ui_leave_confirm_trade"
  | "cm_ui_leave_confirm_group"
  | "cm_ui_leave_confirm_direct";

/** 스와이프 나가기 확인 i18n key — room 정책별 */
export function getSwipeLeaveConfirmI18nKey(policyType: MessengerPolicyRoomType): MessengerSwipeLeaveConfirmKey {
  if (policyType === "trade") return "cm_ui_leave_confirm_trade";
  if (policyType === "group") return "cm_ui_leave_confirm_group";
  return "cm_ui_leave_confirm_direct";
}
