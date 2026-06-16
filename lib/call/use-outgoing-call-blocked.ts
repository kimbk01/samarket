"use client";

import { useSyncExternalStore } from "react";
import { getActiveCallSessionCallId, subscribeActiveCallSession } from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked, subscribeCallActionLock } from "@/lib/call/call-action-lock";

export function useOutgoingCallBlocked(): { blocked: boolean; activeCallId: string | null } {
  useSyncExternalStore(subscribeActiveCallSession, getActiveCallSessionCallId, () => null);
  useSyncExternalStore(subscribeCallActionLock, () => isOutgoingCallStartBlocked(), () => false);
  return {
    blocked: isOutgoingCallStartBlocked(),
    activeCallId: getActiveCallSessionCallId(),
  };
}
