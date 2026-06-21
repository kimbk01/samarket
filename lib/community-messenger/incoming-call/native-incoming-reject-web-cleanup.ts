"use client";

import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import { releaseCallActionLock } from "@/lib/call/call-action-lock";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { applyIncomingCallConsumedSideEffects } from "@/lib/community-messenger/incoming-call-accept-gateway";
import { resetIncomingCallActionGuards } from "@/lib/community-messenger/incoming-call-action-guard";
import { markIncomingCallHardClearedSession } from "@/lib/community-messenger/incoming-call/accept-presenter-dismiss";
import { clearDibayCallPendingRoute } from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";

export type NativeIncomingRejectWebCleanupArgs = {
  sessionId: string;
  source: string;
  hardClearedAt: Map<string, number>;
  activeIncomingCallIds: Set<string>;
  suppressMissedSound: Set<string>;
  removeSessionFromIncomingList?: (sessionId: string) => void;
};

/**
 * Native reject / swipe dismiss — Web consumed·surface·busy 정리 (PATCH 완료 전).
 * P0-3: 거절 직후 발신 block·수신 UI 재등장 방지.
 */
export function applyNativeIncomingRejectWebCleanup(args: NativeIncomingRejectWebCleanupArgs): void {
  const sid = args.sessionId.trim();
  if (!sid) return;

  logDibayCall("reject_patch_start", {
    sessionId: sid,
    callId: sid,
    source: args.source,
  });

  if (!isDibayCallConsumed(sid)) {
    applyIncomingCallConsumedSideEffects(sid, "rejected", args.source);
  } else {
    dibayIncomingLaneStopRing("already_consumed", sid);
  }

  markIncomingCallHardClearedSession(args.hardClearedAt, sid);
  args.activeIncomingCallIds.delete(sid);
  args.suppressMissedSound.add(sid);
  resetIncomingCallActionGuards(sid);
  releaseCallActionLock(`native_reject_${args.source}`);
  void hardClearActiveCallSession(sid, "native_reject");
  clearDibayCallPendingRoute();
  args.removeSessionFromIncomingList?.(sid);
}
