"use client";

import { MessageLongPressPopover } from "@/components/community-messenger/room/message/MessageLongPressPopover";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MessengerPhotoSelectSaveSheet } from "@/components/community-messenger/room/MessengerPhotoSelectSaveSheet";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isCommunityMessengerStoreOrderDeliveryRoom } from "@/lib/community-messenger/room-context-meta";
import { useState } from "react";
import {
  MessengerForwardSheet,
  type MessengerForwardSource,
} from "@/components/community-messenger/forward/MessengerForwardSheet";

export function CommunityMessengerRoomPhase2MessageOverlays() {
  const { t } = useI18n();
  const vm = useMessengerRoomPhase2View();
  /** 「전달하기」 대상 선택 시트 (통합 공유 S6) */
  const [forwardSource, setForwardSource] = useState<MessengerForwardSource | null>(null);
  const messageActionItem = vm.messageActionItem;
  const actionMsg = messageActionItem?.item;
  /** 통화 기록(`call_stub`) 신고·차단은 통화 HARD LOCK 영향 분석·승인 전 제외 */
  const canReportPeerMessage = Boolean(
    actionMsg &&
      !actionMsg.isMine &&
      !actionMsg.pending &&
      actionMsg.messageType !== "system" &&
      actionMsg.messageType !== "call_stub" &&
      String(actionMsg.senderId ?? "").trim()
  );
  const canBlockPeerSender =
    canReportPeerMessage &&
    vm.snapshot?.room.roomType === "direct" &&
    !isCommunityMessengerStoreOrderDeliveryRoom(vm.snapshot.room);

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
          onForward={() => {
            const it = messageActionItem.item;
            const roomId = String(vm.snapshot?.room.id ?? "").trim();
            if (!roomId) return;
            setForwardSource({
              roomId,
              messageId: it.id,
              previewText: it.messageType === "sticker" ? t("cm_home_preview_sticker") : String(it.content ?? ""),
            });
            vm.setMessageActionItem(null);
          }}
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
          onReportMessage={
            canReportPeerMessage
              ? () => {
                  const target = messageActionItem.item;
                  vm.setMessageActionItem(null);
                  void vm.reportTarget({
                    reportType: "message",
                    messageId: target.id,
                    reportedUserId: target.senderId ?? undefined,
                  });
                }
              : undefined
          }
          onBlockSender={
            canBlockPeerSender
              ? () => {
                  const senderId = String(messageActionItem.item.senderId ?? "").trim();
                  vm.setMessageActionItem(null);
                  void vm.blockPeerFromMessage(senderId);
                }
              : undefined
          }
        />
      ) : null}
      {/* 「사진 선택해서 저장」 — 길게 누르기 메뉴가 닫힌 뒤에도 방 위에 유지 */}
      <MessengerPhotoSelectSaveSheet />
      {vm.leaveRoomConfirmOpen ? (
        <MobileConfirmBottomSheet
          open
          onCancel={vm.cancelLeaveRoomConfirm}
          title={t("popup_chat_room_leave_title")}
          cancelLabel={t("common_cancel")}
          confirmLabel={t("popup_cta_leave")}
          confirmTone="danger"
          onConfirm={() => {
            void vm.leaveRoom();
          }}
          zIndexClass="z-[70]"
          ariaLabel={t("cm_ui_leave_confirm_aria")}
          interactionMode="blocking"
        />
      ) : null}
      <MessengerForwardSheet source={forwardSource} onClose={() => setForwardSource(null)} />
    </>
  );
}
