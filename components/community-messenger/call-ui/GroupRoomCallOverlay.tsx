"use client";

/* eslint-disable react-hooks/refs -- `CommunityMessengerGroupCallHandle`는 훅 반환 객체이며 ref가 아님; `.call*`·`panel` 등 접근이 오탐으로 걸립니다. */

import type { CommunityMessengerCallParticipant } from "@/lib/community-messenger/types";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";
import type { MessageKey } from "@/lib/i18n/messages";
import { getCommunityMessengerPermissionGuide } from "@/lib/community-messenger/call-permission";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { useMessengerCallMainBottomNavSuppress } from "@/lib/layout/messenger-call-main-bottom-nav-suppress";

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

function remoteVideoPeers(groupCall: CommunityMessengerGroupCallHandle) {
  return groupCall.remotePeers.filter((p) => p.agora.videoTrack);
}

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
  useMessengerCallMainBottomNavSuppress(Boolean(sessionPanel || endedPanel));

  if (endedPanel) {
    const endedVm: CallScreenViewModel = {
      mode: endedPanel.kind === "video" ? "video" : "voice",
      direction: "outgoing",
      phase:
        endedPanel.reason === "declined"
          ? "declined"
          : endedPanel.reason === "missed"
            ? "missed"
            : endedPanel.reason === "failed"
              ? "failed"
              : "ended",
      peerLabel: endedPanel.peerLabel,
      peerAvatarUrl: null,
      statusText:
        endedPanel.reason === "declined"
          ? t("cm_ui_call_status_declined")
          : endedPanel.reason === "missed"
            ? t("cm_ui_missed_call_notification")
            : endedPanel.reason === "failed"
              ? t("cm_ui_connection_failed")
              : endedPanel.reason === "canceled"
                ? t("cm_ui_call_cancelled")
                : t("cm_ui_call_end_short"),
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
          label: t("common_retry"),
          icon: "retry",
          onClick: () => void groupCall.startOutgoingCall(endedPanel.kind === "video" ? "video" : "voice"),
        },
        {
          id: "reject-after-end",
          label: t("cm_ui_decline_action"),
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

  const videoRemotes = remoteVideoPeers(groupCall);
  const remoteLead = videoRemotes[0] ?? groupCall.remotePeers[0] ?? null;
  const hasLocal = Boolean(groupCall.localStream);
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
            label: groupCall.busy === "call-reject" ? t("cm_ui_rejecting") : t("cm_ui_reject"),
            icon: "decline",
            tone: "danger",
            disabled: groupCall.busy === "call-reject" || groupCall.busy === "call-accept",
            onClick: () => void groupCall.rejectIncomingCall(),
          },
          {
            id: "accept",
            label: groupCall.busy === "call-accept" ? t("cm_ui_connecting") : t("cm_ui_accept"),
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
              label: t("cm_ui_switch_camera"),
              icon: "camera-switch",
              disabled: !hasLocal,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "camera",
              label: t("cm_ui_camera"),
              icon: "camera",
              active: hasLocal,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "mute",
              label: t("cm_ui_mute"),
              icon: "mic",
              active: true,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "end",
              label: sessionPanel.mode === "active" ? t("cm_ui_end_call") : t("cm_ui_cancel_short"),
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
              label: t("cm_ui_speaker"),
              icon: "speaker",
              active: true,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "video",
              label: t("cm_ui_switch_to_video"),
              icon: "video",
              disabled: sessionPanel.mode === "active",
              onClick: () => void groupCall.startOutgoingCall("video"),
            },
            {
              id: "mute",
              label: t("cm_ui_mute"),
              icon: "mic",
              active: true,
              onClick: () => void onRetryCallDevicePermission(),
            },
            {
              id: "end",
              label: sessionPanel.mode === "active" ? t("cm_ui_end_call") : t("cm_ui_cancel_short"),
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
      label: t("cm_ui_reconnect"),
      icon: "retry",
      disabled: groupCall.busy === "call-retry",
      onClick: () => void groupCall.retryConnection(),
    });
  }
  if (permissionGuide && !hasLocal && sessionPanel.mode !== "incoming") {
    secondaryActions.push({
      id: "permission",
      label: permissionGuide.retryLabel ?? t("cm_ui_check_permission"),
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
          ? t("cm_ui_video_call")
          : t("cm_ui_voice_call")
        : sessionPanel.mode === "dialing"
          ? "Ringing..."
          : sessionPanel.mode === "connecting"
            ? t("cm_ui_group_call_connecting")
            : t("cm_ui_group_call_in_progress"),
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
        videoRemotes.length > 1 ? (
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 bg-black">
            {videoRemotes.slice(0, 4).map((peer) => (
              <div key={peer.userId} className="relative min-h-0 min-w-0 bg-black">
                <video
                  ref={(node) => {
                    groupCall.bindRemoteVideo(peer.userId, node);
                  }}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 sam-text-xxs text-white">
                  {peer.label}
                </span>
              </div>
            ))}
          </div>
        ) : remoteLead ? (
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
      sessionPanel.kind === "video" && hasLocal ? (
        <video ref={groupCall.localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      ) : undefined,
    showRemoteVideo: Boolean(remoteLead),
    showLocalVideo: Boolean(hasLocal && remoteLead),
    participantsSummary:
      isGroupRoom && groupCall.participants.length
        ? t("cm_ui_participant_count", { count: groupCall.participants.length })
        : null,
  };

  return (
    <>
      <CallScreen vm={vm} variant="overlay" />
      {groupCall.remotePeers.map((peer) => (
        <audio
          key={`audio:${peer.userId}`}
          ref={(node) => {
            groupCall.bindRemoteAudio(peer.userId, node);
          }}
          autoPlay
          playsInline
          className="hidden"
        />
      ))}
    </>
  );
}
