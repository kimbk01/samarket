/**
 * Missed-call Bell Authority — when to write notification_events.missed_call.
 * @see docs/dibay-call-authority-lock.md
 */

import { hasMissedCallPresentationEvidence } from "@/lib/community-messenger/call-multi-device-authority";

export type MissedCallBellDecision =
  | { notify: true }
  | { notify: false; skipReason: string };

export type MissedDeliveryEvidenceRow = {
  status?: string | null;
  provider_response?: Record<string, unknown> | null;
};

/**
 * Product contract:
 * - ring_timeout / status=missed + presentation evidence → Bell exactly once (dedupe key)
 * - caller_cancelled / callee_rejected / busy / superseded / answered_elsewhere / connected → no Bell
 */
export function decideMissedCallBellNotify(input: {
  sessionMode?: string | null;
  endedReason?: string | null;
  deliveryRows?: MissedDeliveryEvidenceRow[] | null;
  incomingPushClaimedAt?: string | null;
}): MissedCallBellDecision {
  const mode = String(input.sessionMode ?? "direct").trim() || "direct";
  if (mode !== "direct") {
    return { notify: false, skipReason: "not_direct" };
  }

  const endedReason = String(input.endedReason ?? "").trim();
  if (endedReason === "incoming_policy_superseded") {
    return { notify: false, skipReason: "incoming_policy_superseded" };
  }
  if (
    endedReason === "answered_elsewhere" ||
    endedReason === "peer_busy" ||
    endedReason === "callee_busy" ||
    endedReason === "canceled" ||
    endedReason === "declined" ||
    endedReason === "redial_replaced"
  ) {
    return { notify: false, skipReason: `ended_reason_${endedReason}` };
  }

  if (hasMissedCallPresentationEvidence(input.deliveryRows ?? [])) {
    return { notify: true };
  }

  /** Durable push claim proves presentation even if delivery row lags serverless timing. */
  if (String(input.incomingPushClaimedAt ?? "").trim()) {
    return { notify: true };
  }

  return { notify: false, skipReason: "no_delivery_evidence" };
}
