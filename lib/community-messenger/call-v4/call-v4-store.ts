"use client";

import { create } from "zustand";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

type CallV4StoreState = {
  phase: CallV4Phase;
  identity: CallV4Identity | null;
  connectedAt: number | null;
  canStartNewCall: boolean;
  setPhase: (phase: CallV4Phase) => void;
  setIdentity: (identity: CallV4Identity | null) => void;
  resetToIdle: () => void;
};

const idleCapabilities = {
  canStartNewCall: true,
} as const;

/** connected 이후 ringing/dialing phase 로 되돌리지 않는다. */
const CONNECTED_PHASE_DOWNGRADE_BLOCKED = new Set<CallV4Phase>([
  "creating",
  "outgoing_ringing",
  "incoming_ringing",
  "accepting",
  "joining",
]);

let connectedBackMinimizeHandler: (() => void) | null = null;

export function registerCallV4ConnectedBackMinimize(handler: (() => void) | null): void {
  connectedBackMinimizeHandler = handler;
}

export function invokeCallV4ConnectedBackMinimize(): void {
  connectedBackMinimizeHandler?.();
}

export function resetCallV4ConnectedBackMinimizeForTests(): void {
  connectedBackMinimizeHandler = null;
}

export const useCallV4Store = create<CallV4StoreState>((set, get) => ({
  phase: "idle",
  identity: null,
  connectedAt: null,
  ...idleCapabilities,
  setPhase: (phase) => {
    const current = get().phase;
    if (current === "connected" && CONNECTED_PHASE_DOWNGRADE_BLOCKED.has(phase)) {
      logCallV4("phase_downgrade_blocked", { fromPhase: current, toPhase: phase });
      return;
    }
    set({ phase });
  },
  setIdentity: (identity) => set({ identity }),
  resetToIdle: () =>
    set({
      phase: "idle",
      identity: null,
      connectedAt: null,
      ...idleCapabilities,
    }),
}));

export function readCallV4Phase(): CallV4Phase {
  return useCallV4Store.getState().phase;
}

export function readCallV4Identity(): CallV4Identity | null {
  return useCallV4Store.getState().identity;
}

export function readCallV4Capabilities(): { canStartNewCall: boolean } {
  return { canStartNewCall: useCallV4Store.getState().canStartNewCall };
}

const TERMINAL_OUTGOING_GATE_RELEASE_STATUSES = new Set([
  "ended",
  "cancelled",
  "rejected",
  "missed",
  "failed",
]);

const OUTGOING_GATE_RELEASE_ALLOWED_PHASES = new Set<CallV4Phase>([
  "connected",
  "joining",
  "outgoing_ringing",
]);

const OUTGOING_GATE_RELEASE_BLOCKED_PHASES = new Set<CallV4Phase>(["creating"]);

/**
 * S5 — terminal finalize 직후 발신 gate만 선해제. cleanupCallV4/resetToIdle 은 별도 경로.
 * remote_terminal_received 시점에는 호출하지 않는다.
 */
export function releaseCallV4OutgoingGateAfterTerminalFinalize(input: {
  callId: string;
  status?: string | null;
  source?: string;
}): boolean {
  const sid = input.callId.trim();
  if (!sid) return false;

  const normalized = (input.status ?? "").trim().toLowerCase();
  const status = normalized === "canceled" ? "cancelled" : normalized;
  if (!TERMINAL_OUTGOING_GATE_RELEASE_STATUSES.has(status)) return false;

  const state = useCallV4Store.getState();
  if (state.identity?.callId !== sid) return false;
  if (OUTGOING_GATE_RELEASE_BLOCKED_PHASES.has(state.phase)) return false;
  if (!OUTGOING_GATE_RELEASE_ALLOWED_PHASES.has(state.phase)) return false;
  if (state.canStartNewCall) return false;

  useCallV4Store.setState({ canStartNewCall: true });
  logCallV4("outgoing_gate_released_after_terminal_finalize", {
    callId: sid,
    status,
    phase: state.phase,
    source: input.source ?? "unknown",
  });
  return true;
}
