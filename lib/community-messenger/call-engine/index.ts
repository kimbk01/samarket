"use client";

import {
  callEngineAcceptIncoming,
  runCallEngineLeavePatchAction,
  runCallEnginePatchAction,
} from "@/lib/community-messenger/call-engine/call-engine-actions";
import {
  buildCallEngineActiveRoute,
  pushCallEngineRouteOnce,
  replaceCallEngineRouteOnce,
  type CallEngineRouter,
} from "@/lib/community-messenger/call-engine/call-engine-route-gate";
import {
  claimCallEngineSurfaceOwner,
  resolveCallEngineIncomingSurfaceOwner,
  type ResolveCallEngineSurfaceArgs,
} from "@/lib/community-messenger/call-engine/call-engine-surface-owner";
import {
  clearCallEngineLocks,
  resetCallEngineLocksForTests,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import {
  clearCallEngineState,
  getCallEngineState,
  resetCallEngineStateForTests,
  setCallEngineState,
} from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  clearCallEngineAgoraJoin,
  joinCallEngineAgoraOnce,
} from "@/lib/community-messenger/call-engine/call-engine-agora-gate";
import {
  startCallEngineIncomingRingtone,
  stopCallEngineIncomingRingtone,
} from "@/lib/community-messenger/call-engine/call-engine-ringtone-owner";
import {
  clearCallEngineDockedSession,
  clearCallEngineMinimizedSession,
  clearCallEngineNativeAcceptPending,
  clearCallEngineNavigationSeed,
  clearCallEnginePendingRoute,
  clearCallEngineReturnPath,
  clearCallEngineActiveVideoSession,
  readCallEngineActiveVideoSession,
  readCallEngineDockedSessionId,
  readCallEngineLocalItem,
  readCallEngineMinimizedSessionId,
  readCallEngineNativeAcceptPending,
  readCallEngineNavigationSeed,
  readCallEnginePendingRoute,
  readCallEngineReturnPath,
  readCallEngineSessionItem,
  removeCallEngineLocalItem,
  removeCallEngineSessionItem,
  writeCallEngineActiveVideoSession,
  writeCallEngineDockedSession,
  writeCallEngineLocalItem,
  writeCallEngineMinimizedSession,
  writeCallEngineNativeAcceptPending,
  writeCallEngineNavigationSeed,
  writeCallEnginePendingRoute,
  writeCallEngineReturnPath,
  writeCallEngineSessionItem,
} from "@/lib/community-messenger/call-engine/call-engine-store";
import {
  dispatchCallEngineNativeEvent,
  subscribeCallEngineNativeEvent,
} from "@/lib/community-messenger/call-engine/call-engine-native-bridge";

export const callEngineActions = {
  acceptIncoming: callEngineAcceptIncoming,
  patch: runCallEnginePatchAction,
  leave: runCallEngineLeavePatchAction,
  joinAgora: joinCallEngineAgoraOnce,
  clearAgoraJoin: clearCallEngineAgoraJoin,
  startIncomingRingtone: startCallEngineIncomingRingtone,
  stopIncomingRingtone: stopCallEngineIncomingRingtone,
  replaceRouteOnce: replaceCallEngineRouteOnce,
  pushRouteOnce: pushCallEngineRouteOnce,
};

export function callEngineDispatch(event: {
  type: "accept" | "reject" | "cancel" | "end" | "missed";
  callId: string;
  source: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (event.type === "accept") {
    return callEngineAcceptIncoming({ callId: event.callId, source: event.source });
  }
  return runCallEnginePatchAction({
    callId: event.callId,
    action: event.type,
    source: event.source,
  });
}

export function resolveCallSurfaceOwner(args: ResolveCallEngineSurfaceArgs) {
  return resolveCallEngineIncomingSurfaceOwner(args);
}

export function resolveCallRouteDecision(args: {
  router: CallEngineRouter;
  callId: string;
  href: string;
  mode: "push" | "replace";
}): boolean {
  if (args.mode === "replace") {
    return replaceCallEngineRouteOnce(args.router, args.callId, args.href);
  }
  return pushCallEngineRouteOnce(args.router, args.callId, args.href);
}

export function resetCallEngineForTest(callId?: string): void {
  if (callId?.trim()) {
    clearCallEngineLocks(callId);
    clearCallEngineState(callId);
    return;
  }
  resetCallEngineLocksForTests();
  resetCallEngineStateForTests();
}

export {
  claimCallEngineSurfaceOwner,
  getCallEngineState,
  setCallEngineState,
  buildCallEngineActiveRoute,
  dispatchCallEngineNativeEvent,
  subscribeCallEngineNativeEvent,
  readCallEngineMinimizedSessionId,
  writeCallEngineMinimizedSession,
  clearCallEngineMinimizedSession,
  readCallEngineDockedSessionId,
  writeCallEngineDockedSession,
  clearCallEngineDockedSession,
  writeCallEnginePendingRoute,
  readCallEnginePendingRoute,
  clearCallEnginePendingRoute,
  writeCallEngineNavigationSeed,
  readCallEngineNavigationSeed,
  clearCallEngineNavigationSeed,
  writeCallEngineReturnPath,
  readCallEngineReturnPath,
  clearCallEngineReturnPath,
  writeCallEngineNativeAcceptPending,
  readCallEngineNativeAcceptPending,
  clearCallEngineNativeAcceptPending,
  writeCallEngineActiveVideoSession,
  readCallEngineActiveVideoSession,
  clearCallEngineActiveVideoSession,
  readCallEngineSessionItem,
  writeCallEngineSessionItem,
  removeCallEngineSessionItem,
  readCallEngineLocalItem,
  writeCallEngineLocalItem,
  removeCallEngineLocalItem,
};
