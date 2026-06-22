"use client";

import {
  getActiveCallSessionCallId,
  hardClearActiveCallSession,
  readActiveCallSessionSnapshot,
} from "@/lib/call/active-call-session";
import { releaseCallActionLock } from "@/lib/call/call-action-lock";
import { clearCallEngineLocks } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";

export type ReleaseLocalCallLifecycleReason =
  | "terminal"
  | "local_ended"
  | "remote_ended"
  | "cancelled"
  | "rejected"
  | "missed"
  | "ended"
  | "ringing_dismiss"
  | "caller_end"
  | "terminal_close_view"
  | "call_client_terminal"
  | "call_client_unmount"
  | "bootstrap_abandon"
  | "stale_active_session_reconcile"
  | string;

/**
 * SSOT — 통화 종료·취소·언마운트 시 클라 잔류 상태 제거.
 * DO NOT: PATCH-only 종료 후 lock/activeCallSession 만 남기기 (연속 발신 peer_busy·already_in_progress 재발).
 */
export async function releaseLocalCallLifecycleForTerminal(
  callId: string | null | undefined,
  reason: ReleaseLocalCallLifecycleReason = "terminal"
): Promise<void> {
  const sid = callId?.trim() ?? getActiveCallSessionCallId()?.trim() ?? "";
  const hadActiveSession = Boolean(sid || readActiveCallSessionSnapshot());
  releaseCallActionLock(reason);
  if (sid) {
    clearCallEngineLocks(sid);
    await hardClearActiveCallSession(sid, reason);
  } else {
    const orphan = readActiveCallSessionSnapshot();
    if (orphan?.callId) {
      clearCallEngineLocks(orphan.callId);
      await hardClearActiveCallSession(orphan.callId, reason);
    }
  }
  logDibayCall("active_session_hard_clear", {
    sessionId: sid || undefined,
    callId: sid || undefined,
    source: reason,
    hadActiveSession,
    lifecycle: "release_local_call_lifecycle",
  });
}

/** fire-and-forget — navigation·effect cleanup 경로 */
export function releaseLocalCallLifecycleForTerminalSync(
  callId: string | null | undefined,
  reason: ReleaseLocalCallLifecycleReason = "terminal"
): void {
  void releaseLocalCallLifecycleForTerminal(callId, reason);
}
