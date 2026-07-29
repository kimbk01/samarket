/**
 * Terminal ended_reason Authority + product mapping.
 *
 * DB session.status CHECK: ringing | active | ended | rejected | missed | cancelled
 * DB ended_reason: free text (no CHECK) — preserve first terminal reason.
 *
 * Product endReason (display / contracts) ↔ stored values:
 * | Product              | status      | ended_reason (typical)     |
 * |----------------------|-------------|----------------------------|
 * | caller_cancelled     | cancelled   | canceled                   |
 * | callee_rejected      | rejected    | declined                   |
 * | callee_busy          | (no session / peer_busy API) | — (local stub) |
 * | ring_timeout         | missed      | missed                     |
 * | answered_elsewhere   | active on winner; loser dismiss | (error, not reason) |
 * | remote/local_ended   | ended       | ended                      |
 * | network_lost / media | ended       | failed_network / failed_*  |
 * | system / heartbeat   | ended       | heartbeat_timeout          |
 * | superseded / redial  | ended       | redial_replaced            |
 */

import type { CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";

/** Server-trusted clientEndedReason values that may override default ended_reason on end. */
export const TRUSTED_CLIENT_ENDED_REASONS = [
  "failed_permission",
  "failed_insecure_context",
  "failed_ice",
  "failed_network",
  "failed_signaling",
  "heartbeat_timeout",
  "redial_replaced",
  "stale_ringing_expired",
  "incoming_policy_superseded",
  "reconcile_stale_ringing",
  "reconcile_stale_active",
] as const;

export type TrustedClientEndedReason = (typeof TRUSTED_CLIENT_ENDED_REASONS)[number];

export function isTrustedClientEndedReason(value: string | null | undefined): value is TrustedClientEndedReason {
  const v = typeof value === "string" ? value.trim() : "";
  return (TRUSTED_CLIENT_ENDED_REASONS as readonly string[]).includes(v);
}

/**
 * Default ended_reason from action → next status.
 * Spelling: status uses UK `cancelled`; reason uses US `canceled` (legacy DB rows).
 */
export function resolveDefaultEndedReason(
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed",
  nextStatus: CommunityMessengerCallSessionStatus,
): string | null {
  if (nextStatus === "active" || nextStatus === "ringing") return null;
  if (nextStatus === "rejected") return "declined";
  if (nextStatus === "cancelled") return "canceled";
  if (nextStatus === "missed") return "missed";
  if (nextStatus === "ended") {
    return action === "cancel" ? "canceled" : "ended";
  }
  return null;
}

/**
 * Resolve ended_reason for a terminal write.
 * Trusted client reasons win on `end` → `ended` (and cancel/missed supersede paths that pass them).
 */
export function resolveTerminalEndedReason(input: {
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed";
  nextStatus: CommunityMessengerCallSessionStatus;
  clientEndedReason?: string | null;
}): string | null {
  const client = typeof input.clientEndedReason === "string" ? input.clientEndedReason.trim() : "";
  if (client && isTrustedClientEndedReason(client)) {
    if (input.nextStatus === "ended" || input.nextStatus === "cancelled" || input.nextStatus === "missed") {
      return client;
    }
  }
  return resolveDefaultEndedReason(input.action, input.nextStatus);
}

/** Product-facing endReason label from stored status + reason (for LOCK docs / UI mapping). */
export function mapStoredToProductEndReason(input: {
  status: string;
  endedReason?: string | null;
}): string {
  const status = input.status.trim();
  const er = (input.endedReason ?? "").trim();
  if (status === "rejected") return "callee_rejected";
  if (status === "cancelled") return "caller_cancelled";
  if (status === "missed") return "ring_timeout";
  if (er === "heartbeat_timeout") return "network_lost";
  if (er.startsWith("failed_")) return er === "failed_network" ? "network_lost" : "media_failed";
  if (er === "redial_replaced" || er === "incoming_policy_superseded") return "superseded";
  if (status === "ended") return "local_ended";
  return status || "invalid_session";
}
