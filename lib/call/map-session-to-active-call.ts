import type { ActiveCallSessionPhase } from "@/lib/call/active-call-session";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const TERMINAL_STATUSES = new Set<CommunityMessengerCallSession["status"]>([
  "ended",
  "rejected",
  "missed",
  "cancelled",
]);

function isTerminalCallSessionStatus(status: CommunityMessengerCallSession["status"]): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function mapSessionStatusToActiveCallPhase(
  session: Pick<CommunityMessengerCallSession, "status" | "isMineInitiator">,
  joined: boolean,
): ActiveCallSessionPhase {
  if (isTerminalCallSessionStatus(session.status)) {
    switch (session.status) {
      case "missed":
        return "missed";
      case "rejected":
      case "cancelled":
        return "ended";
      case "ended":
        return "ended";
      default:
        return "ended";
    }
  }
  if (session.status === "ringing") {
    return session.isMineInitiator ? "dialing" : "ringing";
  }
  if (session.status === "active") {
    return joined ? "active" : "connecting";
  }
  return "idle";
}
