import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";

export type CallV3State =
  | "idle"
  | "incoming"
  | "outgoing"
  | "accepting"
  | "connecting"
  | "active"
  | "ending"
  | "ended"
  | "missed"
  | "rejected";

export type CallV3Role = "caller" | "callee";

export type CallV3EventType =
  | "CALL_INCOMING"
  | "CALL_DIAL_START"
  | "CALL_CREATED"
  | "CALL_ACCEPT_CLICK"
  | "CALL_ACCEPTED"
  | "CALL_JOIN_START"
  | "CALL_JOINED"
  | "CALL_REMOTE_JOINED"
  | "CALL_REMOTE_LEFT"
  | "CALL_END_CLICK"
  | "CALL_REMOTE_ENDED"
  | "CALL_TIMEOUT"
  | "CALL_MISSED"
  | "CALL_REJECTED"
  | "CALL_CLEANUP_DONE";

export type CallV3IncomingPayload = {
  sessionId: string;
  roomId: string;
  callKind: CommunityMessengerCallKind;
  peerUserId: string;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  startedAt?: string;
  session?: CommunityMessengerCallSession | null;
};

export type CallV3DialStartPayload = {
  roomId: string;
  callKind: CommunityMessengerCallKind;
  peerUserId?: string | null;
  peerLabel?: string;
  peerAvatarUrl?: string | null;
};

export type CallV3CreatedPayload = {
  session: CommunityMessengerCallSession;
};

export type CallV3RemoteEndPayload = {
  sessionId: string;
  senderId: string | null;
  reason?: string | null;
};

export type CallV3Event =
  | { type: "CALL_INCOMING"; payload: CallV3IncomingPayload }
  | { type: "CALL_DIAL_START"; payload: CallV3DialStartPayload }
  | { type: "CALL_CREATED"; payload: CallV3CreatedPayload }
  | { type: "CALL_ACCEPT_CLICK" }
  | { type: "CALL_ACCEPTED"; payload?: { session?: CommunityMessengerCallSession | null } }
  | { type: "CALL_JOIN_START" }
  | { type: "CALL_JOINED" }
  | { type: "CALL_REMOTE_JOINED" }
  | { type: "CALL_REMOTE_LEFT" }
  | { type: "CALL_END_CLICK" }
  | { type: "CALL_REMOTE_ENDED"; payload: CallV3RemoteEndPayload }
  | { type: "CALL_TIMEOUT" }
  | { type: "CALL_MISSED" }
  | { type: "CALL_REJECTED" }
  | { type: "CALL_CLEANUP_DONE" };

export type CallV3EffectType =
  | "START_RING"
  | "STOP_RING"
  | "PATCH_ACCEPT"
  | "PATCH_REJECT"
  | "PATCH_END"
  | "PATCH_CANCEL"
  | "PATCH_MISSED"
  | "SEND_HANGUP_SIGNAL"
  | "AGORA_JOIN"
  | "AGORA_LEAVE"
  | "NAVIGATE_TO_CALL"
  | "NAVIGATE_BACK"
  | "DISMISS_NOTIFICATION"
  | "CLEANUP_MEDIA"
  | "START_MISSED_TIMER"
  | "STOP_MISSED_TIMER";

export type CallV3Effect = { type: CallV3EffectType; reason?: string };

export type CallV3Context = {
  state: CallV3State;
  sessionId: string | null;
  roomId: string | null;
  role: CallV3Role | null;
  kind: CommunityMessengerCallKind;
  peerUserId: string | null;
  peerLabel: string;
  peerAvatarUrl: string | null;
  dbSession: CommunityMessengerCallSession | null;
  localJoined: boolean;
  remoteJoined: boolean;
  /** reject/accept/missed 후 timeout 차단 */
  terminalConsumed: boolean;
  startedAt: string | null;
};

export const INITIAL_CALL_V3_CONTEXT: CallV3Context = {
  state: "idle",
  sessionId: null,
  roomId: null,
  role: null,
  kind: "voice",
  peerUserId: null,
  peerLabel: "",
  peerAvatarUrl: null,
  dbSession: null,
  localJoined: false,
  remoteJoined: false,
  terminalConsumed: false,
  startedAt: null,
};

export function isCallV3TerminalState(state: CallV3State): boolean {
  return state === "ended" || state === "missed" || state === "rejected";
}

export function isCallV3LiveState(state: CallV3State): boolean {
  return (
    state === "incoming" ||
    state === "outgoing" ||
    state === "accepting" ||
    state === "connecting" ||
    state === "active" ||
    state === "ending"
  );
}

export function mapDbStatusToCallV3Hint(
  status: CommunityMessengerCallSessionStatus
): CallV3State | null {
  switch (status) {
    case "ringing":
      return null;
    case "active":
      return "connecting";
    case "ended":
    case "cancelled":
      return "ended";
    case "rejected":
      return "rejected";
    case "missed":
      return "missed";
    default:
      return null;
  }
}
