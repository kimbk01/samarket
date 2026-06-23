export type CallV4Phase =
  | "idle"
  | "incoming_ringing"
  | "accepting"
  | "joining"
  | "connected"
  | "ending"
  | "ended"
  | "rejected"
  | "missed"
  | "failed";

export const CALL_V4_TERMINAL_PHASES = [
  "ended",
  "rejected",
  "missed",
  "failed",
] as const satisfies readonly CallV4Phase[];

export type CallV4TerminalPhase = (typeof CALL_V4_TERMINAL_PHASES)[number];

export function isCallV4TerminalPhase(phase: CallV4Phase): phase is CallV4TerminalPhase {
  return (CALL_V4_TERMINAL_PHASES as readonly CallV4Phase[]).includes(phase);
}

export type CallV4Direction = "incoming";

export type CallV4MediaType = "audio" | "video";

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
