/**
 * C2-A SSOT — server session status → caller-facing finalize reason.
 * Unknown / non-terminal values must NOT become `rejected` (거절 오분류 금지).
 */
import type { CallV4Direction } from "@/lib/community-messenger/call-v4/call-v4-types";
import type { CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";

export type CallV4MappedRemoteTerminalReason = CallV4TerminalPhase | "no_answer";

/**
 * @param status — `community_messenger_call_sessions.status` (or poll equivalent)
 * @param direction — current V4 identity direction; outgoing+missed → no_answer
 */
export function mapCallV4RemoteTerminalReason(
  status: string | null | undefined,
  direction?: CallV4Direction | null
): CallV4MappedRemoteTerminalReason {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") {
    if (direction === "outgoing") return "no_answer";
    return "missed";
  }
  if (normalized === "ended") return "ended";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "failed" || normalized === "failed_or_stale") return "failed";
  /**
   * C2-A: empty / ringing / active / garbage → neutral `ended` (종료 경로).
   * Do not invent rejected. Do not invent failed without evidence.
   */
  return "ended";
}
