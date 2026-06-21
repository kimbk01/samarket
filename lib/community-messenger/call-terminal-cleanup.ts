"use client";

import { releaseCallActionLockForCallId } from "@/lib/call/call-action-lock";
import { releaseLocalCallSession } from "@/lib/call/active-call-session";
import { syncTerminalCallClientState } from "@/lib/call/call-terminal-sync-cleanup";
import { notifyCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { pinCommunityMessengerCallTerminalSurfaceDismiss } from "@/lib/community-messenger/call-session-navigation-seed";
import { clearAllCommunityCallLocalSessionFlags } from "@/lib/community-messenger/call-presentation-ownership";
import { resetCommunityMessengerCallRuntimeSurface } from "@/lib/community-messenger/call-runtime-registry";

const TERMINAL_STATUS_SET = new Set([
  "ended",
  "rejected",
  "cancelled",
  "canceled",
  "missed",
  "failed",
  "declined",
]);

export function isTerminalStatusForCleanup(status: string | null | undefined): boolean {
  const st = status?.trim().toLowerCase() ?? "";
  return TERMINAL_STATUS_SET.has(st);
}

type CleanupArgs = {
  sessionId: string;
  reason: string;
  source?: string;
};

function logCleanupStepFailure(args: {
  sessionId: string;
  source: string;
  step: string;
  reason: string;
  error: unknown;
}): void {
  if (typeof console === "undefined") return;
  console.warn("[cm-call-terminal-cleanup] step_failed", {
    sessionId: args.sessionId,
    source: args.source,
    step: args.step,
    reason: args.reason,
    error: args.error instanceof Error ? args.error.message : "unknown",
  });
}

function normalizeReason(reason: string): string {
  const raw = reason.trim().toLowerCase();
  if (!raw) return "terminal";
  if (raw === "declined") return "rejected";
  return raw;
}

/**
 * terminal cleanup SSOT.
 * 동일 sessionId 다중 호출에 안전(idempotent)하며, 단계별 best-effort 정리를 수행한다.
 */
export async function cleanupCommunityCallTerminal(args: CleanupArgs): Promise<void> {
  const sid = args.sessionId.trim();
  if (!sid) return;
  const normalizedReason = normalizeReason(args.reason);
  const source = args.source?.trim() || "unknown";

  try {
    pinCommunityMessengerCallTerminalSurfaceDismiss(sid);
  } catch (error) {
    logCleanupStepFailure({
      sessionId: sid,
      source,
      step: "pin_terminal_surface",
      reason: normalizedReason,
      error,
    });
  }

  try {
    syncTerminalCallClientState(sid, normalizedReason);
  } catch (error) {
    logCleanupStepFailure({
      sessionId: sid,
      source,
      step: "sync_terminal_state",
      reason: normalizedReason,
      error,
    });
  }

  try {
    clearAllCommunityCallLocalSessionFlags();
    resetCommunityMessengerCallRuntimeSurface();
    notifyCommunityCallHostSync();
  } catch (error) {
    logCleanupStepFailure({
      sessionId: sid,
      source,
      step: "clear_hosted_presentation",
      reason: normalizedReason,
      error,
    });
  }

  try {
    releaseCallActionLockForCallId(sid, normalizedReason);
  } catch (error) {
    logCleanupStepFailure({
      sessionId: sid,
      source,
      step: "release_action_lock",
      reason: normalizedReason,
      error,
    });
  }

  try {
    await releaseLocalCallSession(sid, normalizedReason);
  } catch (error) {
    logCleanupStepFailure({
      sessionId: sid,
      source,
      step: "release_local_call_session",
      reason: normalizedReason,
      error,
    });
  }
}
