import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { callV4Accept, callV4Cancel, callV4End, callV4Reject } from "@/lib/community-messenger/call-v4/call-v4-actions";
import {
  isCallV4CameraSwitchAvailable,
  publishCallV4LocalVideo,
  setCallV4MicEnabled,
  switchCallV4CameraFacing,
  unpublishCallV4LocalVideo,
} from "@/lib/community-messenger/call-v4/call-v4-agora-media";
import { toggleCallV4SpeakerRoute } from "@/lib/community-messenger/call-v4/call-v4-audio-route";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import type { CallV4MediaSnapshot } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import {
  callV4ConnectionSignalTierMessageKey,
} from "@/lib/community-messenger/call-v4/call-v4-network-quality";
import type { CallV4ConnectionSignalTier } from "@/lib/community-messenger/call-v4/call-v4-types";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import {
  invokeCallV4ConnectedBackMinimize,
} from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import type { CallV4VideoPresenterState } from "@/lib/community-messenger/call-v4/call-v4-video-presenter";

type SafeTranslate = (
  key: string,
  options?: { fallbackKo?: string; fallbackEn?: string; count?: number }
) => string;

export function mapCallV4PhaseToCallPhase(phase: CallV4Phase): CallPhase {
  switch (phase) {
    case "creating":
    case "outgoing_ringing":
    case "incoming_ringing":
      return "ringing";
    case "accepting":
    case "joining":
    case "ending":
      return "connecting";
    case "connected":
      return "connected";
    case "ended":
      return "ended";
    case "rejected":
    case "cancelled":
      return "declined";
    case "missed":
      return "missed";
    case "failed":
      return "failed";
    default:
      return "connecting";
  }
}

export type BuildCallV4ScreenViewModelInput = {
  callId: string;
  phase: CallV4Phase;
  identity: CallV4Identity | null;
  connectedAt: number | null;
  safeT: SafeTranslate;
  router: { replace: (href: string) => void; push: (href: string) => void };
  presenter?: CallV4VideoPresenterState | null;
  mediaState?: CallV4MediaSnapshot;
};

function buildCallV4ConnectingViewModel(callId: string, safeT: SafeTranslate): CallScreenViewModel {
  const statusText = safeT("cm_ui_connecting", { fallbackKo: "연결 중", fallbackEn: "Connecting" });
  return {
    visualTheme: "starbucks",
    mode: "voice",
    direction: "incoming",
    phase: "connecting",
    peerLabel: statusText,
    peerAvatarUrl: null,
    statusText,
    subStatusText: statusText,
    topLabel: null,
    onTopLabelClick: null,
    footerNote: null,
    connectionLabel: statusText,
    connectionSignalTier: null,
    connectedAt: null,
    endedAt: null,
    endedDurationSeconds: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: false,
      cameraEnabled: false,
      localVideoMinimized: true,
    },
    onBack: null,
    primaryActions: [],
    secondaryActions: [],
    suppressTerminalView: false,
  };
}

const CONNECTION_SIGNAL_FALLBACKS: Record<
  CallV4ConnectionSignalTier,
  { fallbackKo: string; fallbackEn: string }
> = {
  good: { fallbackKo: "통신 상태 좋음", fallbackEn: "Connection quality · good" },
  fair: { fallbackKo: "통신 상태 보통", fallbackEn: "Connection quality · fair" },
  poor: { fallbackKo: "통신 상태 나쁨", fallbackEn: "Connection quality · poor" },
  checking: { fallbackKo: "통신 상태 확인 중", fallbackEn: "Checking connection…" },
};

function buildCallV4ConnectionPresentation(
  callPhase: CallPhase,
  phase: CallV4Phase,
  tier: CallV4ConnectionSignalTier | null | undefined,
  safeT: SafeTranslate,
): { connectionLabel: string | null; connectionSignalTier: "good" | "fair" | "poor" | null } {
  if (callPhase === "connected") {
    const resolvedTier: CallV4ConnectionSignalTier = tier ?? "checking";
    const key = callV4ConnectionSignalTierMessageKey(resolvedTier);
    return {
      /** Dock·상태 pill 용 — 풀스크린 상단 대형 패널에는 노출하지 않는다. */
      connectionLabel: safeT(key, CONNECTION_SIGNAL_FALLBACKS[resolvedTier]),
      connectionSignalTier: resolvedTier === "checking" ? null : resolvedTier,
    };
  }
  if (callPhase === "connecting" || phase === "joining" || phase === "accepting") {
    return {
      connectionLabel: safeT("cm_ui_connecting", { fallbackKo: "연결 중", fallbackEn: "Connecting" }),
      connectionSignalTier: null,
    };
  }
  return { connectionLabel: null, connectionSignalTier: null };
}

export function buildCallV4ScreenViewModel(input: BuildCallV4ScreenViewModelInput): CallScreenViewModel | null {
  const { callId, phase, identity, connectedAt, safeT, router, presenter, mediaState } = input;
  if (!identity || identity.callId !== callId) {
    if (phase === "accepting" || phase === "joining") {
      return buildCallV4ConnectingViewModel(callId, safeT);
    }
    const activePhases: CallV4Phase[] = ["connected", "ending", "incoming_ringing", "outgoing_ringing", "creating"];
    if (!activePhases.includes(phase)) return null;
    return null;
  }

  const nativeAcceptInflight = isNativeAcceptInflight(callId);
  const suppressIncomingActions =
    nativeAcceptInflight || phase === "accepting" || phase === "joining";
  const peerLabel =
    identity.peerLabel?.trim() ||
    safeT("cm_ui_call_active_voice", { fallbackKo: "통화 중", fallbackEn: "On a call" });

  const displayPhase: CallV4Phase =
    nativeAcceptInflight && phase === "incoming_ringing" ? "accepting" : phase;
  const callPhase = mapCallV4PhaseToCallPhase(displayPhase);
  const isOutgoing = identity.direction === "outgoing";
  const isOutgoingDialing = isOutgoing && (phase === "outgoing_ringing" || phase === "creating");

  const primaryActions: CallActionItem[] = [];
  if (!isOutgoing && phase === "incoming_ringing" && !suppressIncomingActions) {
    primaryActions.push(
      {
        id: "reject",
        label: safeT("cm_ui_reject", { fallbackKo: "거절", fallbackEn: "Decline" }),
        icon: "decline",
        tone: "danger",
        dataTestId: "call-v4-incoming-reject",
        onClick: () => void callV4Reject(callId, router),
      },
      {
        id: "accept",
        label: safeT("cm_ui_accept", { fallbackKo: "수락", fallbackEn: "Accept" }),
        icon: "accept",
        tone: "accept",
        dataTestId: "call-v4-incoming-accept",
        onClick: () => void callV4Accept(callId, router, { source: "sheet" }),
      }
    );
  } else if (nativeAcceptInflight && phase === "incoming_ringing") {
    logCallV4("incoming_actions_suppressed_native_accept", { callId });
  } else if (isOutgoingDialing) {
    primaryActions.push({
      id: "end",
      label: safeT("cm_ui_end_call", { fallbackKo: "통화 종료", fallbackEn: "End call" }),
      icon: "end",
      tone: "danger",
      dataTestId: "call-v4-cancel-button",
      onClick: () => void callV4Cancel(callId, router),
    });
  } else if (phase === "joining" || phase === "connected" || phase === "accepting") {
    primaryActions.push({
      id: "end",
      label: safeT("cm_ui_end_call", { fallbackKo: "통화 종료", fallbackEn: "End call" }),
      icon: "end",
      tone: "danger",
      dataTestId: "call-v4-end-button",
      onClick: () => void callV4End(callId, router),
    });
  }

  const ms = mediaState ?? {
    micEnabled: true,
    speakerEnabled: identity.mediaType === "video",
    cameraEnabled: false,
    localVideoMinimized: true,
    localVideoReady: false,
    remoteVideoReady: false,
    incomingVideoUpgradeRequest: false,
    pendingVideoUpgradeRequest: false,
    connectionSignalTier: null,
  };

  const secondaryActions: CallActionItem[] = [];
  const isVideoCall = identity.mediaType === "video";
  const isVideoUiMode = Boolean(presenter?.isVideoUiMode && phase === "connected");
  const useConnectedVideoSurface = isVideoCall && callPhase === "connected";

  if (phase === "connected") {
    secondaryActions.push({
      id: "mute",
      label: ms.micEnabled
        ? safeT("cm_ui_mute", { fallbackKo: "음소거", fallbackEn: "Mute" })
        : safeT("cm_ui_unmute", { fallbackKo: "음소거 해제", fallbackEn: "Unmute" }),
      icon: "mic",
      active: !ms.micEnabled,
      onClick: () => void setCallV4MicEnabled(callId, !ms.micEnabled),
    });
    secondaryActions.push({
      id: "speaker",
      label: safeT("cm_ui_speaker", { fallbackKo: "스피커", fallbackEn: "Speaker" }),
      icon: "speaker",
      active: ms.speakerEnabled,
      onClick: () => void toggleCallV4SpeakerRoute(callId),
    });
  }

  if (phase === "connected" && isVideoCall) {
    secondaryActions.push(
      {
        id: "camera",
        label: ms.cameraEnabled
          ? safeT("cm_ui_camera_off", { fallbackKo: "카메라 끄기", fallbackEn: "Turn camera off" })
          : safeT("cm_ui_switch_to_video", { fallbackKo: "카메라 켜기", fallbackEn: "Turn camera on" }),
        icon: "video",
        active: ms.cameraEnabled,
        onClick: () => {
          if (ms.cameraEnabled) {
            void unpublishCallV4LocalVideo(callId, presenter?.localVideoRef.current ?? null);
          } else {
            void publishCallV4LocalVideo(callId, presenter?.localVideoRef.current ?? null);
          }
        },
      },
      {
        id: "camera-switch",
        label: safeT("cm_ui_switch_camera", { fallbackKo: "전환", fallbackEn: "Flip" }),
        icon: "camera-switch",
        disabled: !ms.cameraEnabled || !isCallV4CameraSwitchAvailable(callId),
        onClick: () => void switchCallV4CameraFacing(callId, presenter?.localVideoRef.current ?? null),
      },
    );
  }

  const statusText =
    callPhase === "connected"
      ? safeT("cm_ui_call_active_voice", { fallbackKo: "통화 중", fallbackEn: "On a call" })
      : phase === "ending"
        ? safeT("cm_ui_ending_call", { fallbackKo: "종료 중", fallbackEn: "Ending…" })
        : isOutgoingDialing
          ? safeT("cm_ui_call_status_outgoing_dialing", { fallbackKo: "발신 중", fallbackEn: "Calling" })
          : phase === "incoming_ringing" && !suppressIncomingActions
            ? safeT("cm_ui_incoming_phone", { fallbackKo: "휴대전화", fallbackEn: "mobile" })
            : safeT("cm_ui_connecting", { fallbackKo: "연결 중", fallbackEn: "Connecting" });

  const subStatusText = isOutgoingDialing
    ? safeT("cm_ui_waiting_for_peer_answer", {
        fallbackKo: "상대방의 응답을 기다리는 중",
        fallbackEn: "Waiting for the other person to answer",
      })
    : phase === "incoming_ringing" && !suppressIncomingActions
      ? safeT("cm_ui_choose_accept_or_reject", {
          fallbackKo: "수락 또는 거절을 선택하세요",
          fallbackEn: "Choose accept or decline",
        })
      : callPhase === "connected"
        ? null
        : suppressIncomingActions
          ? safeT("cm_ui_connecting", { fallbackKo: "연결 중", fallbackEn: "Connecting" })
          : null;

  const connectionPresentation = buildCallV4ConnectionPresentation(
    callPhase,
    displayPhase,
    ms.connectionSignalTier,
    safeT,
  );

  const canMinimizeConnectedToDock = phase === "connected" && canEnterCallV4PipOrDock(phase);

  return {
    callTelemetryId: callId,
    visualTheme: "starbucks",
    mode: useConnectedVideoSurface || isVideoUiMode ? "video" : "voice",
    direction: identity.direction,
    phase: callPhase,
    peerLabel,
    peerAvatarUrl: identity.peerAvatarUrl ?? null,
    statusText,
    subStatusText,
    topLabel: null,
    onTopLabelClick: null,
    footerNote: null,
    connectionLabel: connectionPresentation.connectionLabel,
    connectionSignalTier: connectionPresentation.connectionSignalTier,
    connectedAt: callPhase === "connected" ? connectedAt : null,
    endedAt: null,
    endedDurationSeconds: null,
    mediaState: {
      micEnabled: ms.micEnabled,
      speakerEnabled: ms.speakerEnabled,
      cameraEnabled: ms.cameraEnabled,
      localVideoMinimized: ms.localVideoMinimized,
    },
    onBack: canMinimizeConnectedToDock ? () => invokeCallV4ConnectedBackMinimize() : null,
    hideOutgoingVideoBrandRow: isOutgoing && isVideoCall ? true : undefined,
    primaryActions,
    secondaryActions,
    mainVideoSlot: presenter?.mainVideoSlot,
    miniVideoSlot: presenter?.miniVideoSlot,
    showRemoteVideo: presenter?.showRemoteVideo,
    showLocalVideo: presenter?.showLocalVideo,
    pipShellMounted: presenter?.pipShellMounted,
    videoPipLayout: presenter?.videoPipLayout ?? null,
    androidOsPipSafeMode: presenter?.androidOsPipSafeMode,
    suppressTerminalView: phase === "ending",
  };
}
