"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  applyCallV4SurfaceOwnerSignal,
  getCallV4PersistedSurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * Pure Web / Windows — explicit `web_in_app` owner claim.
 * CONTRACT: visibility is used only here for claim eligibility, never for sheet render gate.
 */
export function isCallV4PureWebOwnerEligible(): boolean {
  return typeof window !== "undefined" && !isCapacitorNativePlatform();
}

export function tryClaimCallV4PureWebIncomingOwner(callId: string, reason: string): boolean {
  if (!isCallV4PureWebOwnerEligible()) return false;
  const sid = callId.trim();
  if (!sid) return false;

  const existing = getCallV4PersistedSurfaceOwner(sid);
  if (existing !== "none" && existing !== "web_in_app") {
    return false;
  }

  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    logCallV4("pure_web_owner_deferred_hidden", { callId: sid, reason });
    return false;
  }

  applyCallV4SurfaceOwnerSignal({
    callId: sid,
    owner: "web_in_app",
    reason,
    ts: Date.now(),
  });
  logCallV4("pure_web_owner_claimed", { callId: sid, reason });
  return true;
}
