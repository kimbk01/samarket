"use client";

import { MessageLongPressPopover } from "@/components/community-messenger/room/message/MessageLongPressPopover";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSwipeLeaveConfirmI18nKey } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

export function CommunityMessengerRoomPhase2MessageOverlays() {
  const { t } = useI18n();
  const vm = useMessengerRoomPhase2View();
  const messageActionItem = vm.messageActionItem;

  const leaveConfirmI18nKey = vm.snapshot
    ? getSwipeLeaveConfirmI18nKey(
        toMessengerPolicyRoomType({
          roomType: vm.snapshot.room.roomType,
          contextMeta: vm.snapshot.room.contextMeta ?? null,
        })
      )
    : "cm_ui_leave_confirm_direct";

  return (
    <>
      {messageActionItem && vm.snapshot ? (
        <MessageLongPressPopover
          open={messageActionItem}
          busy={vm.busy}
          roomUnavailable={vm.roomUnavailable}
          snapshot={vm.snapshot}
          onClose={() => vm.setMessageActionItem(null)}
          onCopy={() => void vm.copyMessageText(messageActionItem.item)}
          onDeleteVoice={
            messageActionItem.item.isMine &&
            messageActionItem.item.messageType === "voice" &&
            !messageActionItem.item.pending
              ? () => {
                  vm.setMessageActionItem(null);
                  void vm.deleteRoomMessage(messageActionItem.item.id);
                }
              : undefined
          }
          onHideForMe={() => {
            vm.setMessageActionItem(null);
            void vm.hideRoomMessageForMe(messageActionItem.item.id);
          }}
          onDeleteForEveryone={() => {
            vm.setMessageActionItem(null);
            void vm.deleteRoomMessageForEveryone(messageActionItem.item.id);
          }}
          onReaction={(key) => {
            void vm.toggleMessageReaction(messageActionItem.item.id, key);
            vm.setMessageActionItem(null);
          }}
          onShareToRoom={() => void vm.shareMessageToOtherRoom(messageActionItem.item)}
          onShareExternal={() => void vm.shareMessageExternally(messageActionItem.item)}
          onShareCopyLink={() => void vm.shareMessageCopyDeepLink(messageActionItem.item)}
          onReply={() => {
            vm.setEditingMessage(null);
            vm.setReplyToMessage(messageActionItem.item);
            vm.setMessageActionItem(null);
            window.requestAnimationFrame(() => vm.composerTextareaRef.current?.focus());
          }}
          onEdit={() => {
            vm.startEditMessage(messageActionItem.item);
          }}
          showPin={vm.isPrivateGroupRoom && vm.canPinGroupMessage && messageActionItem.item.messageType !== "system"}
          pinLabel={
            vm.snapshot.room.pinnedMessageId === messageActionItem.item.id
              ? vm.t("cm_ui_group_unpin_message")
              : vm.t("cm_ui_group_pin_message")
          }
          pinDisabled={vm.busy === "group-pin"}
          onPin={() => {
            const pinnedId = vm.snapshot.room.pinnedMessageId;
            const nextId =
              pinnedId === messageActionItem.item.id ? null : messageActionItem.item.id;
            vm.setMessageActionItem(null);
            void vm.pinGroupMessage(nextId);
          }}
        />
      ) : null}
      {vm.leaveRoomConfirmOpen ? (
        <MobileConfirmBottomSheet
          open
          onCancel={vm.cancelLeaveRoomConfirm}
          title={t("cm_ui_leave_chat_room")}
          description={t(leaveConfirmI18nKey)}
          cancelLabel={t("common_cancel")}
          confirmLabel={t("cm_ui_leave")}
          confirmTone="danger"
          onConfirm={() => {
            void vm.leaveRoom();
          }}
          zIndexClass="z-[70]"
          ariaLabel={t("cm_ui_leave_confirm_aria")}
          interactionMode="blocking"
        />
      ) : null}
    </>
  );
}
