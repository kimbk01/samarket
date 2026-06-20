"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { syncIncomingCallRing, stopIncomingCallRing } from "@/lib/community-messenger/incoming-call/ring-owner";
import { readCallEngineState, type CallEngineState } from "@/lib/call-engine/call-engine-state";

let hardClearedAtRef: Map<string, number> = new Map();

/** Global incoming list hard-clear map — set by GlobalCommunityMessengerIncomingCall */
export function setCallEngineRingHardClearedMap(map: Map<string, number>): void {
  hardClearedAtRef = map;
}

export function stopCallEngineRing(sessionId: string | null | undefined, reason: string): void {
  stopIncomingCallRing(reason, sessionId ?? null);
}

export function syncCallEngineRingFromState(state: CallEngineState = readCallEngineState()): void {
  if (state.phase !== "incoming" || !state.sessionId || !state.callKind) {
    if (state.sessionId) {
      stopIncomingCallRing(`engine_phase_${state.phase}`, state.sessionId);
    } else {
      syncIncomingCallRing(null);
    }
    return;
  }

  syncIncomingCallRing({
    sessionId: state.sessionId,
    callKind: state.callKind as CommunityMessengerCallKind,
    hardClearedAt: hardClearedAtRef,
    source: "call_engine",
  });
}
