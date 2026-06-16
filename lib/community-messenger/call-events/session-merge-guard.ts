/**
 * Session merge guard — block stale ringing rows after terminal latch.
 * See docs/community-messenger/incoming-call-ssot.md
 */
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import {
  type CallTerminalTombstoneContext,
  isCallTerminal,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import { shouldSkipActiveCallRecoveryRouting } from "@/lib/community-messenger/call-active-session-recovery";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type MergeGuardSource = "merge_fetch" | "realtime" | "fcm_wake" | "optimistic";

/**
 * True when a ringing session must not be merged into the incoming list.
 */
export function shouldBlockRingingSessionMerge(
  session: Pick<CommunityMessengerCallSession, "id" | "status">,
  ctx: CallTerminalTombstoneContext,
  now = Date.now(),
  source: MergeGuardSource = "merge_fetch"
): boolean {
  if (session.status !== "ringing") return false;

  const sid = session.id.trim();
  if (!sid) return false;

  if (isCallTerminal(sid, ctx, now)) {
    logDibayCall("stale_ringing_blocked", {
      sessionId: sid,
      callId: sid,
      source,
    });
    return true;
  }

  if (shouldSkipActiveCallRecoveryRouting(sid)) {
    logDibayCall("stale_ringing_blocked", {
      sessionId: sid,
      callId: sid,
      source: "recovery_routing_skip",
    });
    return true;
  }

  return false;
}

/** Filter server/previous session list — drop blocked ringing rows. */
export function filterSessionsRespectingTerminalLatch(
  sessions: CommunityMessengerCallSession[],
  ctx: CallTerminalTombstoneContext,
  now = Date.now(),
  source: MergeGuardSource = "merge_fetch"
): CommunityMessengerCallSession[] {
  return sessions.filter((s) => !shouldBlockRingingSessionMerge(s, ctx, now, source));
}

/**
 * Redial: new callId is allowed; replay of tombstoned callId is blocked.
 */
export function canAcceptIncomingSessionId(
  callId: string,
  ctx: CallTerminalTombstoneContext,
  now = Date.now()
): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  if (isCallTerminal(sid, ctx, now)) {
    logDibayCall("incoming_ignored_consumed", {
      sessionId: sid,
      callId: sid,
      source: "merge_guard_redial",
    });
    return false;
  }
  return true;
}
