"use client";

export { isCallEngineV2Enabled } from "@/lib/call-engine/flag";
export {
  readCallEngineState,
  subscribeCallEngine,
  setCallEnginePhase,
  resetCallEngineToIdle,
  resetCallEngineStateForTests,
  type CallEnginePhase,
  type CallEngineState,
  type CallEngineRole,
} from "@/lib/call-engine/call-engine-state";
export {
  acceptCall,
  clearAcceptCallPatchedId,
  resetAcceptCallEngineForTests,
  type AcceptCallOptions,
  type AcceptCallResult,
  type CallEngineAcceptSource,
} from "@/lib/call-engine/accept-call";
export {
  rejectCall,
  closeCallSession,
  runEngineIncomingCallReject,
  setCallEngineCloseHardClearedMap,
  type CloseCallSessionReason,
  type CloseCallSessionOptions,
} from "@/lib/call-engine/close-call-session";
export {
  registerAgoraJoinDelegate,
  registerMediaDisposeDelegate,
  joinCallSessionOnce,
  disposeCallMediaViaDelegate,
  resetCallAgoraLifecycleForTests,
} from "@/lib/call-engine/call-agora-lifecycle";
export {
  stopCallEngineRing,
  syncCallEngineRingFromState,
  setCallEngineRingHardClearedMap,
} from "@/lib/call-engine/call-ring-controller";
export {
  registerCallEngineRouter,
  getCallEngineRouter,
  buildCallEngineAcceptHref,
  type CallEngineRouter,
} from "@/lib/call-engine/call-engine-router";
export { buildCallEngineNativeBridgeHandlers } from "@/lib/call-engine/call-native-bridge";
