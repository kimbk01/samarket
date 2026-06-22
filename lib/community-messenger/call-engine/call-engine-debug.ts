"use client";

import type { CallEngineState } from "@/lib/community-messenger/call-engine/call-engine-types";

export function logCallEngineEvent(event: string, payload: Record<string, unknown>): void {
  console.info("[call-engine]", event, payload);
}

export function logCallEngineStateTransition(callId: string, from: CallEngineState, to: CallEngineState): void {
  logCallEngineEvent("state_transition", { callId, sessionId: callId, from, to });
}
