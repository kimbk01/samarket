import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { callV4Accept, callV4Cancel, callV4End, callV4Reject } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

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
    connectionLabel: null,
    connectedAt: null,
    endedAt: null,
    endedDurationSeconds: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: false,
      localVideoMinimized: true,
    },
    onBack: null,
    primaryActions: [],
    secondaryActions: [],
    suppressTerminalView: false,
  };
}

export function buildCallV4ScreenViewModel(input: BuildCallV4ScreenViewModelInput): CallScreenViewModel | null {
  const { callId, phase, identity, connectedAt, safeT, router } = input;
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

  return {
    visualTheme: "starbucks",
    mode: identity.mediaType === "video" ? "video" : "voice",
    direction: identity.direction,
    phase: callPhase,
    peerLabel,
    peerAvatarUrl: identity.peerAvatarUrl ?? null,
    statusText,
    subStatusText,
    topLabel: null,
    onTopLabelClick: null,
    footerNote: null,
    connectionLabel: callPhase === "connected" ? statusText : null,
    connectedAt: callPhase === "connected" ? connectedAt : null,
    endedAt: null,
    endedDurationSeconds: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: false,
      localVideoMinimized: true,
    },
    onBack: null,
    primaryActions,
    secondaryActions: [],
    suppressTerminalView: phase === "ending",
  };
}
