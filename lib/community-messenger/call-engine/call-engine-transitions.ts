"use client";

import { CALL_ENGINE_TERMINAL_STATES, type CallEngineState } from "@/lib/community-messenger/call-engine/call-engine-types";

const ALLOWED_TRANSITIONS: Readonly<Record<CallEngineState, readonly CallEngineState[]>> = {
  idle: ["outgoing_creating", "incoming_ringing", "accepting", "rejected", "missed", "cancelled", "ended", "failed"],
  outgoing_creating: ["outgoing_ringing", "cancelled", "failed"],
  outgoing_ringing: ["joining", "cancelled", "rejected", "missed", "failed"],
  incoming_ringing: ["accepting", "rejected", "missed", "cancelled", "failed"],
  accepting: ["joining", "failed", "cancelled"],
  joining: ["connected", "failed", "ended"],
  connected: ["reconnecting", "ending", "ended", "failed"],
  reconnecting: ["connected", "failed", "ended"],
  ending: ["ended", "failed"],
  ended: [],
  rejected: [],
  missed: [],
  cancelled: [],
  failed: [],
};

export function isCallEngineTerminalState(state: CallEngineState): boolean {
  return (CALL_ENGINE_TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransitionCallEngineState(from: CallEngineState, to: CallEngineState): boolean {
  if (from === to) return true;
  const next = ALLOWED_TRANSITIONS[from];
  return next.includes(to);
}

export function assertCallEngineTransition(from: CallEngineState, to: CallEngineState): void {
  if (!canTransitionCallEngineState(from, to)) {
    throw new Error(`invalid_call_engine_transition:${from}->${to}`);
  }
}
