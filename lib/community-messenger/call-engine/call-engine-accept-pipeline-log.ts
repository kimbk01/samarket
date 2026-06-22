"use client";

import { getCallEngineSurfaceOwner, isCallEngineTerminalConsumed } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { readCallConsumedReason } from "@/lib/community-messenger/incoming-call-state";

const TAG = "[DIBAY_CALL_ACCEPT_PIPELINE]";

export function logAcceptPipeline(
  step:
    | "accept_click"
    | "accept_signal_received"
    | "optimistic_incoming_closed"
    | "accept_patch_start"
    | "accept_patch_done"
    | "route_request"
    | "route_allowed"
    | "route_blocked"
    | "route_fallback"
    | "call_screen_owner_acquired"
    | "call_screen_mounted"
    | "agora_join_start"
    | "agora_join_success"
    | "agora_join_blocked",
  data: Record<string, unknown>,
): void {
  const payload = { ...data };
  if (step === "route_blocked" || step === "agora_join_blocked") {
    console.warn(TAG, step, payload);
    return;
  }
  console.info(TAG, step, payload);
}

export function buildAcceptRouteBlockReason(callId: string): {
  reason: string;
  phase: string;
  consumedReason: ReturnType<typeof readCallConsumedReason>;
  surfaceOwner: string | null;
  routeLock: boolean;
} {
  const sid = callId.trim();
  return {
    reason: isCallEngineTerminalConsumed(sid) ? "terminal_consumed" : "route_lock_or_router",
    phase: getCallEngineState(sid),
    consumedReason: readCallConsumedReason(sid),
    surfaceOwner: getCallEngineSurfaceOwner(sid),
    routeLock: false,
  };
}
