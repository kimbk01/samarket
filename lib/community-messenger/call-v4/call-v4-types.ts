export type CallV4Phase =
  | "idle"
  | "creating"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "accepting"
  | "joining"
  | "connected"
  | "ending"
  | "ended"
  | "cancelled"
  | "rejected"
  | "missed"
  | "failed";

export const CALL_V4_TERMINAL_PHASES = [
  "ended",
  "cancelled",
  "rejected",
  "missed",
  "failed",
] as const satisfies readonly CallV4Phase[];

export type CallV4TerminalPhase = (typeof CALL_V4_TERMINAL_PHASES)[number];

export function isCallV4TerminalPhase(phase: CallV4Phase): phase is CallV4TerminalPhase {
  return (CALL_V4_TERMINAL_PHASES as readonly CallV4Phase[]).includes(phase);
}

export type CallV4Direction = "incoming" | "outgoing";

export type CallV4MediaType = "audio" | "video";

/** Agora last-mile 3단계: 좋음 / 보통 / 나쁨 (+ 연결 전 확인 중) */
export type CallV4ConnectionSignalTier = "checking" | "good" | "fair" | "poor";

export type CallV4Identity = {
  callId: string;
  roomId: string;
  callerUserId: string;
  calleeUserId: string;
  direction: CallV4Direction;
  mediaType: CallV4MediaType;
  createdAt: string;
  peerLabel?: string;
  peerAvatarUrl?: string | null;
};
