"use client";

import { releaseCallActionLockForCallId } from "@/lib/call/call-action-lock";
import { syncClearActiveCallSessionLocal } from "@/lib/call/active-call-session";

/**
 * Terminal 확정 직후 — activeCallSession·callActionLock 을 동기 정리한다.
 * router.replace / CallClient unmount 전에 호출해 재발신 block 을 막는다.
 */
export function syncTerminalCallClientState(callId: string, reason: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  const cleared = syncClearActiveCallSessionLocal(sid, reason);
  if (cleared) {
    releaseCallActionLockForCallId(sid, reason);
  }
  return cleared;
}
