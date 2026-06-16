import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";

export type CallState =
  | "idle"
  | "incoming"
  | "outgoing"
  | "accepting"
  | "connecting"
  | "active"
  | "ending"
  | "ended"
  | "missed"
  | "rejected"
  | "failed";

export type CallRole = "caller" | "callee";

export type CallEventType =
  | "CALL_INCOMING"
  | "CALL_DIAL_START"
  | "CALL_CREATED"
  | "CALL_DIAL_FAILED"
  | "CALL_ACCEPT_CLICK"
  | "CALL_ACCEPTED"
  | "CALL_JOIN_START"
  | "CALL_JOINED"
  | "CALL_JOIN_FAILED"
  | "CALL_REMOTE_JOINED"
  | "CALL_REMOTE_LEFT"
  | "CALL_END_CLICK"
  | "CALL_REMOTE_ENDED"
  | "CALL_TIMEOUT"
  | "CALL_MISSED"
  | "CALL_REJECTED"
  | "CALL_CLEANUP_DONE";

export type CallIncomingPayload = {
  sessionId: string;
  roomId: string;
  callKind: CommunityMessengerCallKind;
  peerUserId: string;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  startedAt?: string;
  session?: CommunityMessengerCallSession | null;
};

export type CallDialStartPayload = {
  roomId: string;
  callKind: CommunityMessengerCallKind;
  peerUserId?: string | null;
  peerLabel?: string;
  peerAvatarUrl?: string | null;
};

export type CallCreatedPayload = {
  session: CommunityMessengerCallSession;
};

export type CallRemoteEndPayload = {
  sessionId: string;
  senderId: string | null;
  reason?: string | null;
};

export type CallEvent =
  | { type: "CALL_INCOMING"; payload: CallIncomingPayload }
  | { type: "CALL_DIAL_START"; payload: CallDialStartPayload }
  | { type: "CALL_CREATED"; payload: CallCreatedPayload }
  | { type: "CALL_DIAL_FAILED" }
  | { type: "CALL_ACCEPT_CLICK" }
  | { type: "CALL_ACCEPTED"; payload?: { session?: CommunityMessengerCallSession | null } }
  | { type: "CALL_JOIN_START" }
  | { type: "CALL_JOINED" }
  | { type: "CALL_JOIN_FAILED" }
  | { type: "CALL_REMOTE_JOINED" }
  | { type: "CALL_REMOTE_LEFT" }
  | { type: "CALL_END_CLICK" }
  | { type: "CALL_REMOTE_ENDED"; payload: CallRemoteEndPayload }
  | { type: "CALL_TIMEOUT" }
  | { type: "CALL_MISSED" }
  | { type: "CALL_REJECTED" }
  | { type: "CALL_CLEANUP_DONE" };

export type CallEffectType =
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

export type CallEffect = { type: CallEffectType; reason?: string };

export type CallContext = {
  state: CallState;
  sessionId: string | null;
  roomId: string | null;
  role: CallRole | null;
  kind: CommunityMessengerCallKind;
  peerUserId: string | null;
  peerLabel: string;
  peerAvatarUrl: string | null;
  dbSession: CommunityMessengerCallSession | null;
  localJoined: boolean;
  remoteJoined: boolean;
  terminalConsumed: boolean;
  startedAt: string | null;
};

export const INITIAL_CALL_CONTEXT: CallContext = {
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

export function isCallTerminalState(state: CallState): boolean {
  return state === "ended" || state === "missed" || state === "rejected" || state === "failed";
}

export function isCallLiveState(state: CallState): boolean {
  return (
    state === "incoming" ||
    state === "outgoing" ||
    state === "accepting" ||
    state === "connecting" ||
    state === "active" ||
    state === "ending"
  );
}

export function mapDbStatusToCallHint(status: CommunityMessengerCallSessionStatus): CallState | null {
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
