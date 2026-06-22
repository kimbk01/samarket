"use client";

import { getActiveCallSessionCallId } from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked, readCallActionLockSnapshot } from "@/lib/call/call-action-lock";
import {
  getCallEngineSurfaceOwner,
  isCallEngineJoinLocked,
  isCallEngineRouteLocked,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { hasNativeIncomingSurfaceForCall } from "@/lib/community-messenger/call-engine/call-engine-native-surface";

const TAG = "[DIBAY_CALL_TERMINAL_PIPELINE]";

export function logTerminalPipelineStart(args: {
  callId: string;
  reason: string;
  phase: string;
  source: string;
}): void {
  console.info(TAG, "terminal_start", args);
}

export function logTerminalPipelineCleanupStep(callId: string, step: string, ok: boolean): void {
  console.info(TAG, "cleanup_step", { callId, step, ok });
}

export function logTerminalPipelineCleanupDone(callId: string, reason: string): void {
  const sid = callId.trim();
  console.info(TAG, "cleanup_done", {
    callId: sid,
    reason,
    actionLock: readCallActionLockSnapshot() != null,
    activeCallSession: getActiveCallSessionCallId(),
    surfaceOwner: getCallEngineSurfaceOwner(sid),
    nativeSurface: hasNativeIncomingSurfaceForCall(sid),
    routeLock: isCallEngineRouteLocked(sid),
    agoraLock: isCallEngineJoinLocked(sid),
    phaseAfter: getCallEngineState(sid),
    canStartNewCall: !isOutgoingCallStartBlocked(),
  });
}

export function logTerminalPipelineCleanupIncomplete(
  callId: string,
  reason: string,
  remaining: string[],
): void {
  console.warn(TAG, "cleanup_incomplete", { callId, reason, remaining });
}
