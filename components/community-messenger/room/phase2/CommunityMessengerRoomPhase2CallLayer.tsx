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
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2CallView } from "@/components/community-messenger/room/phase2/messenger-room-phase2-call-context";

export function CommunityMessengerRoomPhase2CallLayer() {
  const vm = useMessengerRoomPhase2CallView();
  const returnToCallSessionId = vm.returnToCallSessionId;
  return (
    <>
      {vm.isGroupRoom && (vm.call.panel || vm.call.endedPanel) ? (
        <GroupRoomCallOverlay
          t={vm.t}
          tt={vm.tt}
          isGroupRoom={vm.isGroupRoom}
          groupPrefix={vm.t("nav_messenger_group_prefix")}
          groupCall={vm.call}
          permissionGuide={vm.permissionGuide}
          formatDuration={formatDuration}
          formatParticipantStatus={formatParticipantStatus}
          onOpenCallPermissionHelp={vm.openCallPermissionHelp}
          onRetryCallDevicePermission={vm.retryCallDevicePermission}
          onAcceptIncomingCall={vm.handleAcceptIncomingCall}
        />
      ) : null}

      {!vm.isGroupRoom && vm.snapshot && returnToCallSessionId ? (
        <div
          className={`fixed left-3 right-3 z-40 flex items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 ${BOTTOM_NAV_STACK_ABOVE_CLASS}`}
        >
          <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 sam-text-xxs font-semibold text-sam-muted">
            진행 중
          </span>
          <div className="min-w-0 flex-1">
            <p className="sam-text-body-secondary font-semibold text-sam-fg">통화 진행 중</p>
            <p className="truncate sam-text-helper text-sam-muted">채팅 중 복귀 가능</p>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem("cm_minimized_call_room");
                sessionStorage.removeItem("cm_minimized_call_session");
              } catch {
                /* ignore */
              }
              const backToCallHref = `/community-messenger/calls/${encodeURIComponent(returnToCallSessionId)}`;
              vm.router.prefetch(backToCallHref);
              vm.router.push(backToCallHref);
            }}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-ink px-3 py-2 sam-text-helper font-semibold text-white"
          >
            통화 화면
          </button>
        </div>
      ) : null}
    </>
  );
}
