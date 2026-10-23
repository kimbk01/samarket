/**
 * E-C1 — busy dial attempt: caller-only durable record helpers.
 *
 * Shared `call_stub` is a room-wide message row (both members see it). There is no
 * per-viewer hide without schema/RPC changes. Owner policy: no stub/unread/bell/push
 * for the busy peer → persist terminal session + call_log only; chat line stays
 * caller-local (`appendLocalCallChatMessageForPeerBusy`).
 */

export type CallBusyKind = "peer" | "caller";

export const CALL_BUSY_ENDED_REASONS = ["peer_busy", "caller_busy"] as const;
export type CallBusyEndedReason = (typeof CALL_BUSY_ENDED_REASONS)[number];

export function busyEndedReasonForKind(kind: CallBusyKind): CallBusyEndedReason {
  return kind === "caller" ? "caller_busy" : "peer_busy";
}

export function busyKindFromEndedReason(
  endedReason: string | null | undefined
): CallBusyKind | null {
  const er = String(endedReason ?? "")
    .trim()
    .toLowerCase();
  if (er === "caller_busy") return "caller";
  if (er === "peer_busy" || er === "callee_busy" || er === "busy") return "peer";
  return null;
}

/** Session/call_log ended_reason values that must not appear on the peer's call history. */
export function isCallerOnlyBusyEndedReason(endedReason: string | null | undefined): boolean {
  return busyKindFromEndedReason(endedReason) != null;
}

/**
 * List filter: busy attempt rows are caller-only.
 * Non-busy rows unchanged. Missing caller id → exclude busy row (fail closed).
 */
export function shouldIncludeCallLogRowForViewer(input: {
  viewerUserId: string;
  callerUserId: string | null | undefined;
  endedReason: string | null | undefined;
}): boolean {
  if (!isCallerOnlyBusyEndedReason(input.endedReason)) return true;
  const viewer = input.viewerUserId.trim().toLowerCase();
  const caller = String(input.callerUserId ?? "")
    .trim()
    .toLowerCase();
  if (!viewer || !caller) return false;
  return viewer === caller;
}
