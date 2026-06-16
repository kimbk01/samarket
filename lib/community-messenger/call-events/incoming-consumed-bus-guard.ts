/**
 * cm.call.incoming_consumed bus — seal vs dismiss-only 분기.
 * See docs/community-messenger/incoming-call-ssot.md
 */
import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call/tombstone";

const INCOMING_CONSUMED_BUS_SEAL_REASONS = new Set<CallConsumedReason>([
  "accepted",
  "declined",
  "missed",
  "ended",
  "cancelled",
]);

/**
 * Cross-tab consumed bus reason that warrants sealIncomingCallTerminal on peer tabs.
 * Unknown / empty → dismiss-only (no tombstone latch — redial safe).
 */
export function resolveIncomingConsumedBusSealReason(
  reason: string | null | undefined
): CallConsumedReason | null {
  const raw = (reason ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "rejected") return "declined";
  if (INCOMING_CONSUMED_BUS_SEAL_REASONS.has(raw as CallConsumedReason)) {
    return raw as CallConsumedReason;
  }
  return null;
}

export function isIncomingConsumedBusDismissOnly(reason: string | null | undefined): boolean {
  return resolveIncomingConsumedBusSealReason(reason) == null;
}
