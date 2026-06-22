import type { CallEngineState } from "@/lib/community-messenger/call-engine/call-engine-types";

/** DB `community_messenger_call_sessions.status` terminal values — server route only (no client import). */
const SERVER_CALL_SESSION_TERMINAL_STATUSES = [
  "ended",
  "rejected",
  "missed",
  "cancelled",
  "failed",
] as const;

const ALLOWED_TRANSITIONS: Readonly<Record<CallEngineState, readonly CallEngineState[]>> = {
  idle: ["outgoing_creating", "incoming_ringing", "accepting", "rejected", "missed", "cancelled", "ended", "failed"],
  outgoing_creating: ["outgoing_ringing", "cancelled", "failed"],
  outgoing_ringing: ["joining", "cancelled", "rejected", "missed", "failed"],
  incoming_ringing: ["accepting", "rejected", "missed", "cancelled", "failed"],
  accepting: ["joining", "failed", "cancelled"],
  joining: ["connected", "failed", "ended"],
  connected: ["reconnecting", "ending", "ended", "failed"],
  reconnecting: ["connected", "failed", "ended"],
  ending: ["ended", "failed"],
  ended: [],
  rejected: [],
  missed: [],
  cancelled: [],
  failed: [],
};

export function isServerCallSessionTerminalStatus(status: string): boolean {
  return (SERVER_CALL_SESSION_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isIdempotentCallSessionPatch(
  currentStatus: string,
  action: "accept" | "reject" | "cancel" | "end" | "missed" | "leave",
): boolean {
  if (action === "accept" && currentStatus === "active") return true;
  if (action === "reject" && currentStatus === "rejected") return true;
  if (action === "cancel" && currentStatus === "cancelled") return true;
  if (action === "end" && currentStatus === "ended") return true;
  if (action === "missed" && currentStatus === "missed") return true;
  if (action === "leave" && currentStatus === "ended") return true;
  return isServerCallSessionTerminalStatus(currentStatus);
}

export function canServerTransitionCallSessionStatus(
  from: CallEngineState,
  to: CallEngineState,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}
