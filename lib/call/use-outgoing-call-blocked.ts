"use client";

import { useSyncExternalStore } from "react";
import { getActiveCallSessionCallId, subscribeActiveCallSession } from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked, subscribeCallActionLock } from "@/lib/call/call-action-lock";
import { readOwnLiveCall, subscribeOwnLiveCall } from "@/lib/call/own-live-call";

export function useOutgoingCallBlocked(): { blocked: boolean; activeCallId: string | null } {
  useSyncExternalStore(subscribeActiveCallSession, getActiveCallSessionCallId, () => null);
  useSyncExternalStore(subscribeCallActionLock, () => isOutgoingCallStartBlocked(), () => false);
  /** V4/네이티브 lane 통화(울림·진행)도 차단 — 두 번째 발신 방지 */
  useSyncExternalStore(subscribeOwnLiveCall, () => readOwnLiveCall() != null, () => false);
  return {
    blocked: isOutgoingCallStartBlocked() || readOwnLiveCall() != null,
    activeCallId: getActiveCallSessionCallId(),
  };
}
