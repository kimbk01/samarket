"use client";

import { patchCommunityMessengerCallSession } from "@/lib/call/call-actions";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { releaseLocalCallSession } from "@/lib/call/active-call-session";
import { dibayCallSealTerminal } from "@/lib/community-messenger/call-lifecycle";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CallEndGuardInput = {
  sessionId: string;
  action?: "end" | "cancel" | "reject" | "missed";
  durationSeconds?: number;
  reason?: string;
  notifyNative?: boolean;
};

export async function runCallEndGuard(input: CallEndGuardInput): Promise<{
  ok: boolean;
  session?: CommunityMessengerCallSession;
  error?: string;
}> {
  const sid = input.sessionId.trim();
  if (!sid) return { ok: false };

  const action = input.action ?? "end";
  logDibayCallFlow("call_end", { sessionId: sid, callId: sid, action, reason: input.reason });

  const patched = await patchCommunityMessengerCallSession(
    sid,
    action,
    input.durationSeconds != null || input.reason
      ? {
          ...(input.durationSeconds != null ? { durationSeconds: input.durationSeconds } : {}),
          ...(input.reason ? { clientEndedReason: input.reason } : {}),
        }
      : undefined,
  );

  dibayCallSealTerminal(sid);
  if (input.notifyNative !== false) {
    await releaseLocalCallSession(sid, input.reason ?? action);
  }

  if (patched.ok) {
    logDibayCallFlow("call_end_sent_to_peer", { sessionId: sid, callId: sid, action });
    logDibayCallFlow("cleanup_done", { sessionId: sid, callId: sid, action });
  }

  return patched;
}

/** 앱 swipe away 등 native service 콜백용 */
export async function runCallEndGuardFromAppSwipe(sessionId: string, reason = "app_swipe"): Promise<void> {
  logDibayCallFlow("app_swipe_detected", { sessionId, callId: sessionId, reason });
  await runCallEndGuard({
    sessionId,
    action: "end",
    reason,
    notifyNative: false,
  });
}
