"use client";

import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { endNativeCallService } from "@/lib/call/native/native-call-service";
import { dibayCallSealTerminal } from "@/lib/community-messenger/call-lifecycle";
import { callEngineActions } from "@/lib/community-messenger/call-engine";

export type CallEndGuardInput = {
  sessionId: string;
  action?: "end" | "cancel" | "reject" | "missed";
  durationSeconds?: number;
  reason?: string;
  notifyNative?: boolean;
};

export async function runCallEndGuard(input: CallEndGuardInput): Promise<{ ok: boolean }> {
  const sid = input.sessionId.trim();
  if (!sid) return { ok: false };

  const action = input.action ?? "end";
  logDibayCallFlow("call_end", { sessionId: sid, callId: sid, action, reason: input.reason });

  const patched = await callEngineActions.patch({
    callId: sid,
    action,
    init:
      input.durationSeconds != null || input.reason
        ? {
            ...(input.durationSeconds != null ? { durationSeconds: input.durationSeconds } : {}),
            ...(input.reason ? { clientEndedReason: input.reason } : {}),
          }
        : undefined,
    source: "call_end_guard",
  });

  if (input.notifyNative !== false) {
    await endNativeCallService(sid, input.reason ?? action);
  }

  dibayCallSealTerminal(sid);

  if (patched.ok) {
    logDibayCallFlow("call_end_sent_to_peer", { sessionId: sid, callId: sid, action });
    logDibayCallFlow("cleanup_done", { sessionId: sid, callId: sid, action });
  }

  return { ok: patched.ok };
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
