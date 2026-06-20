"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** Call engine SSOT — 6 phases only */
export type CallEnginePhase =
  | "idle"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "ended";

export type CallEngineRole = "caller" | "callee";

export type CallEngineState = {
  phase: CallEnginePhase;
  sessionId: string | null;
  role: CallEngineRole | null;
  callKind: CommunityMessengerCallKind | null;
  source: string | null;
  updatedAt: number;
};

const SYNC_EVENT = "dibay:call-engine-state-sync";

let engineState: CallEngineState = {
  phase: "idle",
  sessionId: null,
  role: null,
  callKind: null,
  source: null,
  updatedAt: Date.now(),
};

function notifySync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function readCallEngineState(): CallEngineState {
  return engineState;
}

export function subscribeCallEngine(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export function setCallEnginePhase(
  patch: Partial<Omit<CallEngineState, "updatedAt">> & Pick<CallEngineState, "phase">,
): CallEngineState {
  engineState = {
    ...engineState,
    ...patch,
    updatedAt: Date.now(),
  };
  notifySync();
  return engineState;
}

export function resetCallEngineToIdle(source = "reset"): CallEngineState {
  return setCallEnginePhase({
    phase: "idle",
    sessionId: null,
    role: null,
    callKind: null,
    source,
  });
}

export function resetCallEngineStateForTests(): void {
  engineState = {
    phase: "idle",
    sessionId: null,
    role: null,
    callKind: null,
    source: null,
    updatedAt: Date.now(),
  };
}
