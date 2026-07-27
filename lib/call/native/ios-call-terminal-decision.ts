/**
 * Pure decision table for iOS CallKit terminal dismiss.
 * Swift `CallTerminalDecision` must stay behavior-aligned (structural tests guard markers).
 *
 * CONTRACT:
 * - Only end CallKit when callSessionId is tracked in the registry.
 * - Never invent a CallKit UUID / reportNewIncomingCall.
 * - Duplicate terminal for the same sessionId is a no-op after first apply.
 * - Stale: terminal sessionId must equal the tracked target; never end a different active id.
 */

export type IosCallTerminalKind =
  | "call_canceled"
  | "call_rejected"
  | "call_ended"
  | "missed_call";

export type IosCallTerminalDecision =
  | { action: "end_tracked"; reason: "tracked_match" }
  | { action: "noop"; reason: "invalid_payload" | "registry_miss" | "duplicate" | "stale_other_active" | "outgoing_guard" };

export type IosCallTerminalDecisionInput = {
  callSessionId: string;
  kind: IosCallTerminalKind | null;
  /** UUID string from CallKit registry for this sessionId, if any. */
  trackedUuid: string | null;
  /** True when this sessionId was already terminal-ended by this authority. */
  alreadyEnded: boolean;
  /** True when registry marks this sessionId as outgoing (caller). */
  isOutgoing: boolean;
  /**
   * Other tracked incoming session ids currently in CallKit registry.
   * Used only to prove we never target them when ending `callSessionId`.
   */
  otherTrackedIncomingIds: string[];
};

const KINDS: ReadonlySet<string> = new Set([
  "call_canceled",
  "call_rejected",
  "call_ended",
  "missed_call",
]);

export function isIosCallTerminalKind(value: unknown): value is IosCallTerminalKind {
  return typeof value === "string" && KINDS.has(value);
}

export function decideIosCallTerminal(input: IosCallTerminalDecisionInput): IosCallTerminalDecision {
  const sid = input.callSessionId.trim();
  if (!sid || !input.kind || !isIosCallTerminalKind(input.kind)) {
    return { action: "noop", reason: "invalid_payload" };
  }
  if (input.alreadyEnded) {
    return { action: "noop", reason: "duplicate" };
  }
  if (!input.trackedUuid) {
    return { action: "noop", reason: "registry_miss" };
  }
  // Outgoing CallKit sessions are owned by the caller path; remote terminal for callee
  // UI must not tear down the local outgoing UI via the APNs callee dismiss authority.
  // VoIP registry already disambiguates; keep the same guard here.
  if (input.isOutgoing) {
    return { action: "noop", reason: "outgoing_guard" };
  }
  if (input.otherTrackedIncomingIds.some((id) => id.trim() && id.trim() !== sid)) {
    // Ending this sid is still allowed — other ids must simply remain untouched.
    // Explicit stale drop only when terminal id is not the tracked one (already covered by miss).
  }
  return { action: "end_tracked", reason: "tracked_match" };
}

export function canonicalizeCallSessionIdFromApnsUserInfo(
  userInfo: Record<string, unknown>
): string | null {
  const keys = ["sessionId", "session_id", "callId", "call_id"] as const;
  for (const key of keys) {
    const raw = userInfo[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  const data = userInfo.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return canonicalizeCallSessionIdFromApnsUserInfo(data as Record<string, unknown>);
  }
  return null;
}

export function canonicalizeTerminalKindFromApnsUserInfo(
  userInfo: Record<string, unknown>
): IosCallTerminalKind | null {
  const raw = userInfo.call_push_kind ?? userInfo.type ?? userInfo.notification_type;
  if (typeof raw !== "string") {
    const data = userInfo.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return canonicalizeTerminalKindFromApnsUserInfo(data as Record<string, unknown>);
    }
    return null;
  }
  const v = raw.trim();
  if (isIosCallTerminalKind(v)) return v;
  if (v === "community_messenger_call_canceled") return "call_canceled";
  if (v === "community_messenger_missed_call") return "missed_call";
  if (v === "cancelled" || v === "canceled") return "call_canceled";
  if (v === "rejected") return "call_rejected";
  if (v === "ended") return "call_ended";
  if (v === "missed") return "missed_call";
  return null;
}
