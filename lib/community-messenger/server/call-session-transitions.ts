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
  action: "accept" | "reject" | "cancel" | "end" | "missed" | "leave" | "connected",
): boolean {
  // accept + active must go through device claim (answered_elsewhere).
  if (action === "accept" && currentStatus === "active") return false;
  // connected + active must go through connected_at CAS / device gate.
  if (action === "connected") return false;
  if (action === "reject" && currentStatus === "rejected") return true;
  if (action === "cancel" && currentStatus === "cancelled") return true;
  if (action === "end" && currentStatus === "ended") return true;
  if (action === "missed" && currentStatus === "missed") return true;
  if (action === "leave" && currentStatus === "ended") return true;
  return isServerCallSessionTerminalStatus(currentStatus);
}

/**
 * Direct status-CAS loser re-read: end/cancel/reject/missed whose session already reached a
 * terminal status (e.g. callee reject racing caller cancel, ring-timeout missed racing reject)
 * is the same outcome the route prefetch (`isIdempotentCallSessionPatch`) reports as idempotent —
 * not a failure. The terminal winner owns log/stub/push.
 * accept / leave / connected are never idempotent here: an accept that lost to a terminal
 * status must not succeed.
 */
export function isTerminalCasLossIdempotent(
  action: "accept" | "reject" | "cancel" | "end" | "missed" | "leave" | "connected",
  freshStatus: string,
): boolean {
  if (action !== "end" && action !== "cancel" && action !== "reject" && action !== "missed") return false;
  return isServerCallSessionTerminalStatus(freshStatus);
}

export function canServerTransitionCallSessionStatus(
  from: CallEngineState,
  to: CallEngineState,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}
