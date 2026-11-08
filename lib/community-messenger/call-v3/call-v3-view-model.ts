import type {
  CallActionItem,
  CallPhase,
  CallScreenViewModel,
} from "@/components/messenger/call/call-ui.types";
import { callV3Accept, callV3Cancel, callV3End, callV3Reject } from "@/lib/community-messenger/call-v3/call-v3-actions";
import type { CallV3Identity, CallV3Phase } from "@/lib/community-messenger/call-v3/call-v3-types";

type SafeTranslate = (
  key: string,
  options?: { fallbackKo?: string; fallbackEn?: string; count?: number }
) => string;

type Translate = (key: string, options?: { count?: number }) => string;

export type BuildCallV3ScreenViewModelInput = {
  callId: string;
  phase: CallV3Phase;
  identity: CallV3Identity | null;
  connectedAt: number | null;
  safeT: SafeTranslate;
  t: Translate;
  router: { replace: (href: string) => void; push: (href: string) => void };
};

export function mapCallV3PhaseToCallPhase(phase: CallV3Phase): CallPhase {
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
    case "cancelled":
      return "declined";
    case "rejected":
      return "declined";
    case "missed":
      return "missed";
    case "failed":
      return "failed";
    default:
      return "connecting";
  }
}

function buildPrimaryActions(input: BuildCallV3ScreenViewModelInput): CallActionItem[] {
  const { callId, phase, identity, safeT, t, router } = input;
  if (!identity || identity.callId !== callId) return [];

  const isOutgoing = identity.direction === "outgoing";
  const isOutgoingDialing = isOutgoing && (phase === "outgoing_ringing" || phase === "creating");
  const isIncomingRinging = !isOutgoing && phase === "incoming_ringing";
  const showEnd = phase === "joining" || phase === "connected" || phase === "accepting";

  if (isIncomingRinging) {
    return [
      {
        id: "reject",
        label: t("cm_ui_reject"),
        icon: "decline",
        tone: "danger",
        dataTestId: "call-v3-incoming-reject",
        onClick: () => void callV3Reject(callId),
      },
      {
        id: "accept",
        label: t("cm_ui_accept"),
        icon: "accept",
        tone: "accept",
        dataTestId: "call-v3-incoming-accept",
        onClick: () => void callV3Accept(callId, router),
      },
    ];
  }

  if (isOutgoingDialing) {
    return [
      {
        id: "end",
        label: safeT("cm_ui_end_call"),
        icon: "end",
        tone: "danger",
        dataTestId: "call-v3-cancel-button",
        onClick: () => void callV3Cancel(callId, router),
      },
    ];
  }

  if (showEnd) {
    return [
      {
        id: "end",
        label: safeT("cm_ui_end_call"),
        icon: "end",
        tone: "danger",
        dataTestId: "call-v3-end-button",
        onClick: () => void callV3End(callId, router),
      },
    ];
  }

  return [];
}

export function buildCallV3ScreenViewModel(input: BuildCallV3ScreenViewModelInput): CallScreenViewModel | null {
  const { callId, phase, identity, connectedAt, safeT, t } = input;
  if (!identity || identity.callId !== callId) return null;

  const callPhase = mapCallV3PhaseToCallPhase(phase);
  const isOutgoing = identity.direction === "outgoing";
  const isOutgoingDialing = isOutgoing && (phase === "outgoing_ringing" || phase === "creating");
  const mode = identity.mediaType === "video" ? "video" : "voice";

  const statusText =
    callPhase === "connected"
      ? safeT("cm_ui_call_active_voice")
      : phase === "ending"
        ? safeT("cm_ui_ending_call")
        : isOutgoingDialing
          ? safeT("cm_ui_call_status_outgoing_dialing")
          : phase === "incoming_ringing"
            ? safeT("cm_ui_incoming_phone")
            : safeT("cm_ui_connecting");

  const subStatusText =
    isOutgoingDialing
      ? safeT("cm_ui_waiting_for_peer_answer")
      : phase === "incoming_ringing"
        ? safeT("cm_ui_choose_accept_or_reject")
        : null;

  const peerLabel =
    identity.peerLabel?.trim() ||
    safeT("cm_ui_call_peer_unknown");

  return {
    visualTheme: "starbucks",
    mode,
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
    primaryActions: buildPrimaryActions(input),
    secondaryActions: [],
    suppressTerminalView: phase === "ending",
  };
}
