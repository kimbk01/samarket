export type CallV3Phase =
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

export const CALL_V3_TERMINAL_PHASES = [
  "ended",
  "cancelled",
  "rejected",
  "missed",
  "failed",
] as const satisfies readonly CallV3Phase[];

export type CallV3TerminalPhase = (typeof CALL_V3_TERMINAL_PHASES)[number];

export function isCallV3TerminalPhase(phase: CallV3Phase): phase is CallV3TerminalPhase {
  return (CALL_V3_TERMINAL_PHASES as readonly CallV3Phase[]).includes(phase);
}

export type CallV3Direction = "outgoing" | "incoming";

export type CallV3MediaType = "audio" | "video";

export type CallV3Identity = {
  callId: string;
  roomId: string;
  callerUserId: string;
  calleeUserId: string;
  direction: CallV3Direction;
  mediaType: CallV3MediaType;
  createdAt: string;
  peerLabel?: string;
  peerAvatarUrl?: string | null;
};
