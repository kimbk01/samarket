"use client";

import { getActiveCallSessionCallId, readActiveCallSessionSnapshot } from "@/lib/call/active-call-session";
import {
  isOutgoingCallStartBlocked,
  readCallActionLockSnapshot,
} from "@/lib/call/call-action-lock";
import type { CallEngineAppVisibility } from "@/lib/community-messenger/call-engine/call-engine-app-visibility";
import { getCallEngineSurfaceOwner, isCallEngineTerminalConsumed } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { readCallConsumedReason, isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";
import type { CallEngineSurfaceOwner } from "@/lib/community-messenger/call-engine/call-engine-types";

export type CallButtonBlockReason =
  | "ok"
  | "live_active_session"
  | "action_lock_held"
  | "phone_verification"
  | "peer_busy";

export type CallButtonStateLogContext = {
  location?: string;
  roomId?: string | null;
  peerId?: string | null;
};

export function resolveCallButtonBlockReason(): {
  disabled: boolean;
  reason: CallButtonBlockReason;
  activeCallSession: ReturnType<typeof readActiveCallSessionSnapshot>;
  actionLock: ReturnType<typeof readCallActionLockSnapshot>;
  terminalConsumed: boolean;
  surfaceOwner: string | null;
  phase: string | null;
  liveCallId: string | null;
  liveStatus: string | null;
  enginePhase: string | null;
} {
  const activeCallSession = readActiveCallSessionSnapshot();
  const actionLock = readCallActionLockSnapshot();
  const liveCallId = getActiveCallSessionCallId();
  const callId = liveCallId ?? activeCallSession?.callId ?? actionLock?.callId ?? null;
  const terminalConsumed = callId ? isCallEngineTerminalConsumed(callId) || isDibayCallConsumed(callId) : false;
  const surfaceOwner = callId ? getCallEngineSurfaceOwner(callId) : null;
  const enginePhase = callId ? getCallEngineState(callId) : null;
  let reason: CallButtonBlockReason = "ok";
  const liveStatus = activeCallSession?.phase ?? null;

  if (liveCallId && !terminalConsumed) {
    reason = "live_active_session";
  } else if (isOutgoingCallStartBlocked()) {
    reason = actionLock ? "action_lock_held" : "live_active_session";
  }

  return {
    disabled: reason !== "ok",
    reason,
    activeCallSession,
    actionLock,
    terminalConsumed,
    surfaceOwner,
    phase: enginePhase,
    liveCallId,
    liveStatus,
    enginePhase,
  };
}

export function logCallButtonState(context: CallButtonStateLogContext = {}): void {
  const state = resolveCallButtonBlockReason();
  console.info("[DIBAY_CALL_ENGINE]", "call_button_state", {
    location: context.location?.trim() || null,
    roomId: context.roomId?.trim() || null,
    peerId: context.peerId?.trim() || null,
    disabled: state.disabled,
    reason: state.reason,
    activeCallSession: state.activeCallSession,
    callActionLock: state.actionLock,
    enginePhase: state.enginePhase,
    liveCallId: state.liveCallId,
    liveStatus: state.liveStatus,
    terminalConsumed: state.terminalConsumed,
    surfaceOwner: state.surfaceOwner,
    phase: state.phase,
  });
}

export function logSurfaceDecision(args: {
  callId: string;
  requestedSurface: CallEngineSurfaceOwner | null;
  currentOwner: string | null;
  phase: string | null;
  consumedReason: ReturnType<typeof readCallConsumedReason>;
  allowed: boolean;
  reason: string;
  hasNativeIncomingSurface?: boolean;
  appVisibility?: CallEngineAppVisibility;
}): void {
  console.info("[DIBAY_CALL_ENGINE]", "surface_decision", {
    callId: args.callId,
    requestedSurface: args.requestedSurface,
    currentOwner: args.currentOwner,
    phase: args.phase,
    consumedReason: args.consumedReason,
    allowed: args.allowed,
    reason: args.reason,
    hasNativeIncomingSurface: args.hasNativeIncomingSurface ?? false,
    appVisibility: args.appVisibility ?? null,
  });
}

export function logSoundState(args: {
  callId: string;
  phase: string | null;
  ringtoneOwner: boolean;
  ringbackOwner: boolean;
  action: "start" | "stop" | "skip";
  reason: string;
}): void {
  console.info("[DIBAY_CALL_ENGINE]", "sound_state", args);
}

export function logCallTiming(args: {
  callId: string;
  event: string;
  phase?: string | null;
}): void {
  const t = typeof performance !== "undefined" ? performance.now() : Date.now();
  console.info("[DIBAY_CALL_METRIC]", "call_timing", {
    callId: args.callId,
    event: args.event,
    t,
    phase: args.phase ?? null,
  });
}
