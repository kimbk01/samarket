import {
  buildCallHistorySubtitle,
  computeCallLogDisplayType,
  isCallLogMissedDisplayType,
} from "@/lib/community-messenger/call-log-row-copy";
import { buildCallPeerDisplayLabel } from "@/lib/community-messenger/call-history/call-peer-display-label";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";

export type CallHistoryStatusPresentation = {
  labelKey: string;
  color: string;
  showDuration: boolean;
  directionKey: string | null;
};

const STATUS_PRESENTATION: Record<CommunityMessengerCallLogDisplayType, CallHistoryStatusPresentation> = {
  outgoing: {
    labelKey: "cm_call_status_outgoing_answered",
    color: "#006241",
    showDuration: true,
    directionKey: "cm_call_direction_outgoing",
  },
  incoming: {
    labelKey: "cm_call_status_incoming_answered",
    color: "#006241",
    showDuration: true,
    directionKey: "cm_call_direction_incoming",
  },
  missed_incoming: {
    labelKey: "cm_call_status_missed",
    color: "#E53935",
    showDuration: false,
    directionKey: null,
  },
  missed_outgoing: {
    labelKey: "cm_call_status_no_answer",
    color: "#E53935",
    showDuration: false,
    directionKey: null,
  },
  rejected: {
    labelKey: "cm_call_status_rejected",
    color: "#FB8C00",
    showDuration: false,
    directionKey: null,
  },
  cancelled: {
    labelKey: "cm_call_status_cancelled",
    color: "#6B7280",
    showDuration: false,
    directionKey: null,
  },
  failed: {
    labelKey: "cm_call_status_failed",
    color: "#E53935",
    showDuration: false,
    directionKey: null,
  },
};

export function presentCallHistoryStatus(
  displayType: CommunityMessengerCallLogDisplayType
): CallHistoryStatusPresentation {
  return STATUS_PRESENTATION[displayType];
}

export type CallHistoryAvatarOverlayKind = "outgoing" | "incoming" | "missed" | null;

export type CallHistoryRowViewModel = {
  callId: string;
  sessionId: string | null;
  roomId: string | null;
  peerUserId: string | null;
  peerName: string;
  peerDisplayLabel: string;
  peerPublicId: string | null;
  peerAvatarUrl: string | null;
  callKind: CommunityMessengerCallLog["callKind"];
  displayType: CommunityMessengerCallLogDisplayType;
  statusPresentation: CallHistoryStatusPresentation;
  subtitleMessageKey: MessageKey;
  subtitleColor: string;
  durationLabel: string | null;
  startedAt: string;
  endedAt: string | null;
  isOutgoing: boolean;
  isMissed: boolean;
  avatarOverlayKind: CallHistoryAvatarOverlayKind;
  canRedial: boolean;
  canNavigate: boolean;
};

function resolveAvatarOverlayKind(
  call: CommunityMessengerCallLog,
  displayType: CommunityMessengerCallLogDisplayType
): CallHistoryAvatarOverlayKind {
  if (call.sessionMode === "group") return null;
  if (isCallLogMissedDisplayType(displayType)) return "missed";
  if (displayType === "outgoing") return "outgoing";
  if (displayType === "incoming") return "incoming";
  return null;
}

export function presentCallHistoryRow(call: CommunityMessengerCallLog): CallHistoryRowViewModel {
  const displayType =
    call.displayType ?? computeCallLogDisplayType(call.status, call.endedReason, call.isOutgoing);
  const normalizedCall = displayType === call.displayType ? call : { ...call, displayType };
  const statusPresentation = presentCallHistoryStatus(displayType);
  const subtitle = buildCallHistorySubtitle(normalizedCall);
  const peerName = call.peerLabel?.trim() || call.title?.trim() || "";
  const peerPublicId = call.peerPublicId?.trim().replace(/^@+/, "") || null;
  const peerDisplayLabel = buildCallPeerDisplayLabel({ peerLabel: peerName, peerPublicId });
  const canNavigate =
    call.sessionMode !== "group"
      ? true
      : Boolean(call.roomId?.trim() || call.sessionId?.trim());
  const canRedial =
    call.sessionMode !== "group" && Boolean(call.roomId?.trim() || call.peerUserId?.trim());

  return {
    callId: call.id,
    sessionId: call.sessionId,
    roomId: call.roomId,
    peerUserId: call.peerUserId,
    peerName,
    peerDisplayLabel,
    peerPublicId,
    peerAvatarUrl: call.peerAvatarUrl,
    callKind: call.callKind,
    displayType,
    statusPresentation,
    subtitleMessageKey: subtitle.messageKey,
    subtitleColor: statusPresentation.color,
    durationLabel: subtitle.durationLabel,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    isOutgoing: call.isOutgoing,
    isMissed: isCallLogMissedDisplayType(displayType),
    avatarOverlayKind: resolveAvatarOverlayKind(call, displayType),
    canRedial,
    canNavigate,
  };
}
