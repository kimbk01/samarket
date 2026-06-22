import { messengerNetworkQualityWorst } from "@/lib/community-messenger/call-provider/agora-network-quality";
import type { CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";

export type CallNetworkQualityLevel =
  | "unknown"
  | "connecting"
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "reconnecting"
  | "lost";

export type CallDisplayConnectionState = {
  level: CallNetworkQualityLevel;
  labelKey: MessageKey;
  warningClassName: string | null;
  showWarningBorder: boolean;
};

export type CallDisplayConnectionDirection = "outgoing" | "incoming";
export type CallDisplayConnectionPhase =
  | "ringing"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "ended"
  | "declined"
  | "missed"
  | "failed";

export type ComputeCallDisplayConnectionStateInput = {
  isTerminal: boolean;
  agoraReconnecting: boolean;
  joined: boolean;
  remoteJoined: boolean;
  sessionStatus: CommunityMessengerCallSessionStatus | string | null | undefined;
  direction: CallDisplayConnectionDirection;
  phase: CallDisplayConnectionPhase;
  isVideoCall: boolean;
  uplinkQuality: number;
  downlinkQuality: number;
};

const WARNING_POOR = "dibay-call-network-poor";
const WARNING_RECONNECTING = "dibay-call-network-reconnecting";
const WARNING_LOST = "dibay-call-network-lost";

function connectedLabelKey(isVideoCall: boolean): MessageKey {
  return isVideoCall ? "cm_ui_call_active_video" : "cm_ui_call_active_voice";
}

export function computeCallDisplayConnectionState(
  input: ComputeCallDisplayConnectionStateInput
): CallDisplayConnectionState {
  if (input.isTerminal) {
    return {
      level: "unknown",
      labelKey: "cm_ui_call_ended",
      warningClassName: null,
      showWarningBorder: false,
    };
  }

  if (input.agoraReconnecting) {
    return {
      level: "reconnecting",
      labelKey: "cm_ui_call_reconnecting",
      warningClassName: WARNING_RECONNECTING,
      showWarningBorder: true,
    };
  }

  if (!input.joined) {
    if (input.direction === "outgoing" && input.phase === "ringing") {
      return {
        level: "connecting",
        labelKey: "cm_ui_connection_calling_peer",
        warningClassName: null,
        showWarningBorder: false,
      };
    }
    return {
      level: "connecting",
      labelKey: "cm_ui_connection_connecting",
      warningClassName: null,
      showWarningBorder: false,
    };
  }

  const worst = messengerNetworkQualityWorst(input.uplinkQuality, input.downlinkQuality);

  if (worst >= 6) {
    return {
      level: "lost",
      labelKey: "cm_ui_connection_status_unstable",
      warningClassName: WARNING_LOST,
      showWarningBorder: true,
    };
  }

  if (worst >= 4) {
    return {
      level: "poor",
      labelKey: "cm_ui_connection_status_poor",
      warningClassName: WARNING_POOR,
      showWarningBorder: true,
    };
  }

  if (worst === 3) {
    return {
      level: "fair",
      labelKey: "cm_ui_connection_status_fair",
      warningClassName: null,
      showWarningBorder: false,
    };
  }

  if (worst === 2) {
    return {
      level: "good",
      labelKey: connectedLabelKey(input.isVideoCall),
      warningClassName: null,
      showWarningBorder: false,
    };
  }

  if (worst === 1) {
    return {
      level: "excellent",
      labelKey: connectedLabelKey(input.isVideoCall),
      warningClassName: null,
      showWarningBorder: false,
    };
  }

  return {
    level: input.remoteJoined || input.sessionStatus === "active" ? "good" : "connecting",
    labelKey:
      input.remoteJoined || input.sessionStatus === "active"
        ? connectedLabelKey(input.isVideoCall)
        : "cm_ui_connection_connecting",
    warningClassName: null,
    showWarningBorder: false,
  };
}
