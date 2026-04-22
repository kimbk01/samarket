"use client";

import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { MessageLongPressPopover } from "@/components/community-messenger/room/message/MessageLongPressPopover";
import { CallStubActionPopover } from "@/components/community-messenger/room/message/CallStubActionPopover";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

export function CommunityMessengerRoomPhase2MessageOverlays() {
  const vm = useMessengerRoomPhase2View();
  const messageActionItem = vm.messageActionItem;
  const callStubSheet = vm.callStubSheet;

  const callRedialDisabled =
    vm.roomUnavailable ||
    (vm.busy != null && String(vm.busy).startsWith("managed-call:")) ||
    vm.call.busy === "call-start" ||
    vm.call.busy === "device-prepare" ||
    vm.call.busy === "call-accept";

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
            vm.setReplyToMessage(messageActionItem.item);
            vm.setMessageActionItem(null);
            window.requestAnimationFrame(() => vm.composerTextareaRef.current?.focus());
          }}
        />
      ) : null}
      {callStubSheet ? (
        <CallStubActionPopover
          open={callStubSheet}
          roomUnavailable={vm.roomUnavailable}
          redialDisabled={callRedialDisabled}
          onClose={() => vm.setCallStubSheet(null)}
          onRedial={(kind) => {
            vm.openCallStubOutgoingConfirm(kind);
          }}
          onFocusComposer={() => {
            window.requestAnimationFrame(() => vm.composerTextareaRef.current?.focus());
          }}
          onCopyText={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(callStubSheet.item.content);
                showMessengerSnackbar("복사했습니다.", { variant: "success" });
              } catch {
                showMessengerSnackbar("복사하지 못했습니다.", { variant: "error" });
              }
            })();
          }}
          onHideLocal={() => {
            vm.hideCallStubLocally(callStubSheet.item.id);
          }}
        />
      ) : null}

      {vm.callStubOutgoingConfirm ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={vm.snapshot.room.title?.trim() || "상대"}
          kind={vm.callStubOutgoingConfirm.kind}
          busy={vm.outgoingDialLocked}
          onCancel={vm.cancelCallStubOutgoingConfirm}
          onConfirm={() => {
            void vm.confirmCallStubOutgoing();
          }}
        />
      ) : null}
    </>
  );
}
