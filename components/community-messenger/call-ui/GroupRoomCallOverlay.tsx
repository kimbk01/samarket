"use client";

/* eslint-disable react-hooks/refs -- `CommunityMessengerGroupCallHandle`는 훅 반환 객체이며 ref가 아님; `.call*`·`panel` 등 접근이 오탐으로 걸립니다. */

import type { CommunityMessengerCallParticipant } from "@/lib/community-messenger/types";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";
import type { MessageKey } from "@/lib/i18n/messages";
import { getCommunityMessengerPermissionGuide } from "@/lib/community-messenger/call-permission";
import { bindMediaStreamToElement } from "@/lib/community-messenger/media-element";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";

type PermissionGuide = ReturnType<typeof getCommunityMessengerPermissionGuide>;

export type GroupRoomCallOverlayProps = {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tt: (text: string, vars?: Record<string, string | number>) => string;
  isGroupRoom: boolean;
  groupPrefix: string;
  groupCall: CommunityMessengerGroupCallHandle;
  permissionGuide: PermissionGuide | null;
  formatDuration: (seconds: number) => string;
  formatParticipantStatus: (status: CommunityMessengerCallParticipant["status"]) => string;
  onOpenCallPermissionHelp: () => void;
  onRetryCallDevicePermission: () => void | Promise<void>;
  onAcceptIncomingCall: () => void | Promise<unknown>;
};

export function GroupRoomCallOverlay({
  t,
  tt,
  isGroupRoom,
  groupPrefix,
  groupCall,
  permissionGuide,
  formatDuration,
  formatParticipantStatus,
  onOpenCallPermissionHelp,
  onRetryCallDevicePermission,
  onAcceptIncomingCall,
}: GroupRoomCallOverlayProps) {
  const sessionPanel = groupCall.panel;
  const endedPanel = groupCall.endedPanel;

  if (endedPanel) {
    const endedVm: CallScreenViewModel = {
      mode: endedPanel.kind === "video" ? "video" : "voice",
      direction: "outgoing",
      phase: endedPanel.reason === "declined" ? "declined" : endedPanel.reason === "missed" ? "missed" : endedPanel.reason === "failed" ? "failed" : "ended",
      peerLabel: endedPanel.peerLabel,
      peerAvatarUrl: null,
      statusText:
        endedPanel.reason === "declined"
          ? "거절됨"
          : endedPanel.reason === "missed"
            ? "응답 없음"
            : endedPanel.reason === "failed"
              ? "연결 실패"
              : "통화 종료",
      subStatusText: groupCall.errorMessage,
      topLabel: isGroupRoom ? `${groupPrefix}${endedPanel.kind === "video" ? t("nav_video_call_label") : t("nav_voice_call_label")}` : null,
      connectedAt: groupCall.connectedAt,
      endedAt: endedPanel.endedAt,
      endedDurationSeconds: endedPanel.endedDurationSeconds,
      mediaState: {
        micEnabled: true,
        speakerEnabled: true,
        cameraEnabled: endedPanel.kind === "video",
        localVideoMinimized: true,
      },
      onBack: groupCall.dismissPanel,
      primaryActions: [
        {
          id: "retry-call",
          label: "다시 시도",
          icon: "retry",
          onClick: () => void groupCall.startOutgoingCall(endedPanel.kind === "video" ? "video" : "voice"),
        },
        {
          id: "reject-after-end",
          label: "거부",
          icon: "decline",
          tone: "danger",
          onClick: groupCall.dismissPanel,
        },
      ],
      autoCloseMs: 2400,
    };

    return <CallScreen vm={endedVm} variant="overlay" />;
  }

  if (!sessionPanel) return null;

  const remoteLead = groupCall.remotePeers[0] ?? null;
  const panelPhase: CallPhase =
    sessionPanel.mode === "incoming"
      ? "ringing"
      : sessionPanel.mode === "dialing"
        ? "ringing"
        : sessionPanel.mode === "connecting"
          ? "connecting"
          : "connected";

  const primaryActions: CallActionItem[] =
    sessionPanel.mode === "incoming"
      ? [
          {
            id: "reject",
            label: groupCall.busy === "call-reject" ? "거절 중" : "거절",
            icon: "decline",
            tone: "danger",
            disabled: groupCall.busy === "call-reject" || groupCall.busy === "call-accept",
            onClick: () => void groupCall.rejectIncomingCall(),
          },
          {
            id: "accept",
            label: groupCall.busy === "call-accept" ? "연결 중" : "수락",
            icon: "accept",
            tone: "accept",
            disabled: groupCall.busy === "call-accept",
            onClick: () => void onAcceptIncomingCall(),
          },
        ]
      : sessionPanel.kind === "video"
        ? [
            {
              id: "switch-camera",
              label: "전환",
              icon: "camera-switch",
              disabled: !groupCall.localStream,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "camera",
              label: "카메라",
              icon: "camera",
              active: Boolean(groupCall.localStream),
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "mute",
              label: "음소거",
              icon: "mic",
              active: true,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "end",
              label: sessionPanel.mode === "active" ? "종료" : "취소",
              icon: "end",
              tone: "danger",
              disabled: groupCall.busy === "call-end" || groupCall.busy === "call-cancel",
              onClick: () =>
                void (sessionPanel.mode === "active" ? groupCall.endActiveCall() : groupCall.cancelOutgoingCall()),
            },
          ]
        : [
            {
              id: "speaker",
              label: "스피커",
              icon: "speaker",
              active: true,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "video",
              label: "영상 전환",
              icon: "video",
              onClick: () => void groupCall.startOutgoingCall("video"),
            },
            {
              id: "mute",
              label: "음소거",
              icon: "mic",
              active: true,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "end",
              label: sessionPanel.mode === "active" ? "종료" : "취소",
              icon: "end",
              tone: "danger",
              disabled: groupCall.busy === "call-end" || groupCall.busy === "call-cancel",
              onClick: () =>
                void (sessionPanel.mode === "active" ? groupCall.endActiveCall() : groupCall.cancelOutgoingCall()),
            },
          ];

  const secondaryActions: CallActionItem[] = [];
  if (groupCall.connectionBadge?.tone === "poor") {
    secondaryActions.push({
      id: "retry",
      label: "다시 연결",
      icon: "retry",
      disabled: groupCall.busy === "call-retry",
      onClick: () => void groupCall.retryConnection(),
    });
  }
  if (permissionGuide && !groupCall.localStream && sessionPanel.mode !== "incoming") {
    secondaryActions.push({
      id: "permission",
      label: permissionGuide.retryLabel ?? "권한 확인",
      icon: "accept",
      onClick: () => void onRetryCallDevicePermission(),
    });
  }

  const vm: CallScreenViewModel = {
    mode: sessionPanel.kind === "video" ? "video" : "voice",
    direction: sessionPanel.mode === "incoming" ? "incoming" : "outgoing",
    phase: panelPhase,
    peerLabel: sessionPanel.peerLabel,
    peerAvatarUrl: null,
    statusText:
      sessionPanel.mode === "incoming"
        ? sessionPanel.kind === "video"
          ? "영상 통화"
          : "음성 통화"
        : sessionPanel.mode === "dialing"
          ? "Ringing..."
          : sessionPanel.mode === "connecting"
            ? "연결중..."
            : "그룹 통화 중",
    subStatusText: groupCall.errorMessage ?? groupCall.callStatusLabel,
    topLabel: isGroupRoom ? `${groupPrefix}${sessionPanel.kind === "video" ? t("nav_video_call_label") : t("nav_voice_call_label")}` : null,
    footerNote: groupCall.connectionBadge?.label ?? null,
    connectionLabel: sessionPanel.mode === "active" ? groupCall.connectionBadge?.label ?? null : null,
    connectedAt: groupCall.connectedAt,
    endedAt: null,
    endedDurationSeconds: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: sessionPanel.kind === "video",
      localVideoMinimized: true,
    },
    onBack: groupCall.dismissPanel,
    primaryActions,
    secondaryActions,
    mainVideoSlot:
      sessionPanel.kind === "video" ? (
        remoteLead ? (
          <div className="absolute inset-0 bg-black">
            <video
              ref={(node) => {
                groupCall.bindRemoteVideo(remoteLead.userId, node);
              }}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-black">
            <video ref={groupCall.localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
        )
      ) : undefined,
    miniVideoSlot:
      sessionPanel.kind === "video" && groupCall.localStream ? (
        <video ref={groupCall.localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      ) : undefined,
    showRemoteVideo: Boolean(remoteLead),
    showLocalVideo: Boolean(groupCall.localStream && remoteLead),
    participantsSummary:
      isGroupRoom && groupCall.participants.length
        ? `${groupCall.participants.length}명 참여`
        : null,
  };

  return (
    <>
      <CallScreen vm={vm} variant="overlay" />
      {sessionPanel.kind !== "video"
        ? groupCall.remotePeers.map((peer) => (
            <audio
              key={`audio:${peer.userId}`}
              ref={(node) => {
                bindMediaStreamToElement(node, peer.stream);
              }}
              autoPlay
              playsInline
              className="hidden"
            />
          ))
        : null}
    </>
  );
}
