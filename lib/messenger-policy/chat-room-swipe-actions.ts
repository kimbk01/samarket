import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import { shouldOmitSwipeLeaveAction } from "@/lib/messenger-policy/messenger-swipe-leave-visibility";

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
 * L-6·L-7: 그룹 방장·주문 매장 사장님은 leave 미노출.
 */
export function getSwipeActions(input: {
  policyType: MessengerPolicyRoomType;
  listContext: MessengerChatListContext;
  viewerIsGroupOwner?: boolean;
  viewerIsDeliveryStoreOwner?: boolean;
  /** L-9 — 방 단위 archived 면 viewer 복원 CTA 비활성(혼동 방지) */
  roomStatusArchived?: boolean;
  isArchivedByViewer?: boolean;
}): MessengerSwipeActionDef[] {
  void input.policyType;
  const { listContext } = input;
  const omitLeave = shouldOmitSwipeLeaveAction({
    viewerIsGroupOwner: Boolean(input.viewerIsGroupOwner),
    viewerIsDeliveryStoreOwner: Boolean(input.viewerIsDeliveryStoreOwner),
  });

  if (listContext === "open_chat") {
    const actions: MessengerSwipeActionDef[] = [
      { kind: "read", labelKey: "cm_ui_swipe_mark_read", disabled: false },
    ];
    if (!omitLeave) {
      actions.push({ kind: "leave", labelKey: "cm_ui_leave", disabled: false });
    }
    return actions;
  }
  const archiveLabelKey = listContext === "archive" ? "cm_ui_swipe_restore" : "cm_ui_archive";
  /** 복원은 viewer `is_archived` 만. 방 status=archived 단독은 복원 불가. */
  const archiveDisabled =
    listContext === "archive" &&
    input.roomStatusArchived === true &&
    input.isArchivedByViewer !== true;
  const actions: MessengerSwipeActionDef[] = [
    { kind: "archive", labelKey: archiveLabelKey, disabled: archiveDisabled },
    { kind: "read", labelKey: "cm_ui_swipe_mark_read", disabled: false },
  ];
  if (!omitLeave) {
    actions.push({ kind: "leave", labelKey: "cm_ui_leave", disabled: false });
  }
  return actions;
}

export type MessengerSwipeLeaveConfirmKey =
  | "cm_ui_leave_confirm_trade"
  | "cm_ui_leave_confirm_group"
  | "cm_ui_leave_confirm_direct"
  | "cm_ui_leave_confirm_delivery";

/** 스와이프 나가기 확인 i18n key — room 정책·배달 여부 */
export function getSwipeLeaveConfirmI18nKey(
  policyType: MessengerPolicyRoomType,
  options?: { isDeliveryRoom?: boolean }
): MessengerSwipeLeaveConfirmKey {
  if (options?.isDeliveryRoom) return "cm_ui_leave_confirm_delivery";
  if (policyType === "trade") return "cm_ui_leave_confirm_trade";
  if (policyType === "group") return "cm_ui_leave_confirm_group";
  return "cm_ui_leave_confirm_direct";
}
