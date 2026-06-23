import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { callV4Accept, callV4End, callV4Reject } from "@/lib/community-messenger/call-v4/call-v4-actions";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

type SafeTranslate = (
  key: string,
  options?: { fallbackKo?: string; fallbackEn?: string; count?: number }
) => string;

export function mapCallV4PhaseToCallPhase(phase: CallV4Phase): CallPhase {
  switch (phase) {
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

export function buildCallV4ScreenViewModel(input: BuildCallV4ScreenViewModelInput): CallScreenViewModel | null {
  const { callId, phase, identity, connectedAt, safeT, router } = input;
  const activePhases: CallV4Phase[] = ["accepting", "joining", "connected", "ending", "incoming_ringing"];
  if (!identity || identity.callId !== callId) {
    if (!activePhases.includes(phase)) return null;
  }

  const callPhase = mapCallV4PhaseToCallPhase(phase);
  const peerLabel =
    identity?.peerLabel?.trim() ||
    safeT("cm_ui_call_active_voice", { fallbackKo: "통화 중", fallbackEn: "On a call" });

  const primaryActions: CallActionItem[] = [];
  if (phase === "incoming_ringing" && identity) {
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
        : safeT("cm_ui_connecting", { fallbackKo: "연결 중", fallbackEn: "Connecting" });

  return {
    visualTheme: "starbucks",
    mode: identity?.mediaType === "video" ? "video" : "voice",
    direction: identity?.direction ?? "incoming",
    phase: callPhase,
    peerLabel,
    peerAvatarUrl: identity?.peerAvatarUrl ?? null,
    statusText,
    subStatusText: statusText,
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
