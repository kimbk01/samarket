"use client";

import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import {
  isDibayCallConsumed,
  markCallConsumed,
  setDibayCallSessionPhase,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import { postCommunityMessengerCallIncomingConsumedBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  markIncomingCallSurfaceConsumed,
  releaseIncomingCallSurface,
} from "@/lib/community-messenger/incoming-call-surface-owner";

/**
 * 수락·거절·missed·ended 직후 공통 — 벨·알림·consumed·bus.
 * router.replace 는 호출하지 않는다.
 */
export function applyIncomingCallConsumedSideEffects(
  sessionId: string,
  reason: CallConsumedReason,
  source: string,
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (isDibayCallConsumed(sid)) {
    logDibayCall("accept_skip_duplicate", {
      sessionId: sid,
      callId: sid,
      reason: "already_consumed",
      source,
    });
    dibayIncomingLaneStopRing("already_consumed", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    return;
  }

  setDibayCallSessionPhase(sid, reason === "accepted" ? "accepting" : "consumed", reason);
  dibayIncomingLaneStopRing(`consumed_${reason}`, sid);
  dismissAllIncomingCallNotificationsFireAndForget(sid);
  markCallConsumed(sid, reason);
  releaseIncomingCallSurface(sid, "web_foreground_overlay", `consumed_${reason}`);
  releaseIncomingCallSurface(sid, "native_foreground_pill", `consumed_${reason}`);
  releaseIncomingCallSurface(sid, "call_screen", `consumed_${reason}`);
  if (reason !== "accepted") {
    markIncomingCallSurfaceConsumed(
      sid,
      reason === "declined"
        ? "declined"
        : reason === "cancelled"
          ? "cancelled"
          : reason === "rejected"
            ? "rejected"
            : "ended",
      source,
    );
  }
  postCommunityMessengerCallIncomingConsumedBusEvent(sid, reason);
  logDibayCall("ring_stop", { sessionId: sid, callId: sid, reason: `consumed_${reason}`, source });
}
