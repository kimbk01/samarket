"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  BackIcon,
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  MicHoldIcon,
  MoreIcon,
  PlusIcon,
  SendPlaneIcon,
  SendVoiceArrowIcon,
  TrashVoiceIcon,
  VideoCallIcon,
  VoiceCallIcon,
  VoiceRecordingLiveWaveform,
  ViberChatBubble,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  CommunityMessengerMessageActionSheet,
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

export function CommunityMessengerRoomPhase2MessageOverlays() {
  const vm = useMessengerRoomPhase2View();
  const messageActionItem = vm.messageActionItem;
  const callStubSheet = vm.callStubSheet;
  return (
    <>
      {messageActionItem ? (
        <CommunityMessengerMessageActionSheet
          item={messageActionItem}
          busy={vm.busy}
          roomUnavailable={vm.roomUnavailable}
          onClose={() => vm.setMessageActionItem(null)}
          onCopy={() => void vm.copyMessageText(messageActionItem)}
          onDelete={
            messageActionItem.isMine &&
            messageActionItem.messageType !== "system" &&
            !messageActionItem.pending
              ? () => {
                  vm.setMessageActionItem(null);
                  void vm.deleteRoomMessage(messageActionItem.id);
                }
              : undefined
          }
          onForward={() => void vm.forwardMessage(messageActionItem)}
          onReply={() => {
            vm.setReplyToMessage(messageActionItem);
            vm.setMessageActionItem(null);
            window.requestAnimationFrame(() => vm.composerTextareaRef.current?.focus());
          }}
          onReportMessage={
            !messageActionItem.isMine && messageActionItem.messageType !== "system"
              ? () => {
                  vm.setMessageActionItem(null);
                  void vm.reportTarget({
                    reportType: "message",
                    messageId: messageActionItem.id,
                    reportedUserId: messageActionItem.senderId ?? undefined,
                  });
                }
              : undefined
          }
          onReportUser={
            !messageActionItem.isMine && messageActionItem.senderId && messageActionItem.messageType !== "system"
              ? () => {
                  vm.setMessageActionItem(null);
                  void vm.reportTarget({
                    reportType: "user",
                    reportedUserId: messageActionItem.senderId ?? undefined,
                  });
                }
              : undefined
          }
          onBlockUser={
            !messageActionItem.isMine && messageActionItem.senderId && messageActionItem.messageType !== "system"
              ? () => {
                  vm.setMessageActionItem(null);
                  void vm.blockPeerFromMessage(messageActionItem.senderId!);
                }
              : undefined
          }
        />
      ) : null}
      {callStubSheet ? (
        <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => vm.setCallStubSheet(null)} />
          <div className="w-full max-h-[min(72vh,480px)] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
            <div className="border-b border-ui-border px-4 py-3">
              <p className="sam-text-body-secondary font-semibold text-ui-fg">통화 메시지</p>
              <p className="mt-1 line-clamp-2 sam-text-helper text-ui-muted">{callStubSheet.content}</p>
            </div>
            <nav className="flex flex-col p-1" aria-label="통화 로그 작업">
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left sam-text-body text-ui-fg active:bg-ui-hover disabled:opacity-40"
                disabled={
                  vm.roomUnavailable ||
                  (vm.busy != null && String(vm.busy).startsWith("managed-call:")) ||
                  vm.call.busy === "call-start" ||
                  vm.call.busy === "device-prepare" ||
                  vm.call.busy === "call-accept"
                }
                onClick={() => {
                  const kind = callStubSheet.callKind === "video" ? "video" : "voice";
                  vm.setCallStubSheet(null);
                  vm.openCallStubOutgoingConfirm(kind);
                }}
              >
                다시 걸기
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left sam-text-body text-ui-fg active:bg-ui-hover"
                onClick={() => {
                  vm.setCallStubSheet(null);
                  window.requestAnimationFrame(() => vm.composerTextareaRef.current?.focus());
                }}
              >
                메시지 보내기
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left sam-text-body text-ui-fg active:bg-ui-hover"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(callStubSheet.content);
                  } catch {
                    showMessengerSnackbar("복사하지 못했습니다.", { variant: "error" });
                  }
                  vm.setCallStubSheet(null);
                }}
              >
                텍스트 복사
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left sam-text-body text-ui-fg active:bg-ui-hover"
                onClick={() => vm.hideCallStubLocally(callStubSheet.id)}
              >
                이 기기에서만 숨기기
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left sam-text-body text-red-600 active:bg-red-50"
                onClick={() => {
                  const id = callStubSheet.id;
                  vm.setCallStubSheet(null);
                  void vm.reportTarget({ reportType: "message", messageId: id });
                }}
              >
                신고
              </button>
            </nav>
            <button
              type="button"
              onClick={() => vm.setCallStubSheet(null)}
              className="mt-1 w-full border-t border-ui-border py-3 sam-text-body font-medium text-ui-muted"
            >
              취소
            </button>
          </div>
        </div>
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

      {vm.replyToMessage && !vm.voiceRecording ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[color:var(--cm-room-primary)] pl-2">
            <p className="sam-text-xxs font-semibold text-[color:var(--cm-room-primary)]">답장</p>
            <p className="line-clamp-2 sam-text-helper text-[color:var(--cm-room-text-muted)]">
              {vm.replyToMessage.messageType === "text"
                ? vm.replyToMessage.content
                : `(${vm.replyToMessage.messageType})`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => vm.setReplyToMessage(null)}
            className="shrink-0 rounded-full px-2 py-1 sam-text-helper font-medium text-[color:var(--cm-room-text-muted)] active:bg-sam-surface/80"
          >
            취소
          </button>
        </div>
      ) : null}
    </>
  );
}
