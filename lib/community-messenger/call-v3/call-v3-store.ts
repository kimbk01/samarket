"use client";

import { create } from "zustand";
import type { CallV3Identity, CallV3Phase } from "@/lib/community-messenger/call-v3/call-v3-types";

type CallV3StoreState = {
  phase: CallV3Phase;
  identity: CallV3Identity | null;
  connectedAt: number | null;
  canStartNewCall: boolean;
  canReceiveNewCall: boolean;
  setPhase: (phase: CallV3Phase) => void;
  setIdentity: (identity: CallV3Identity | null) => void;
  resetToIdle: () => void;
};

const idleCapabilities = {
  canStartNewCall: true,
  canReceiveNewCall: true,
} as const;

export const useCallV3Store = create<CallV3StoreState>((set) => ({
  phase: "idle",
  identity: null,
  connectedAt: null,
  ...idleCapabilities,
  setPhase: (phase) => set({ phase }),
  setIdentity: (identity) => set({ identity }),
  resetToIdle: () =>
    set({
      phase: "idle",
      identity: null,
      connectedAt: null,
      ...idleCapabilities,
    }),
}));

export function readCallV3Phase(): CallV3Phase {
  return useCallV3Store.getState().phase;
}

export function readCallV3Identity(): CallV3Identity | null {
  return useCallV3Store.getState().identity;
}

export function readCallV3Capabilities(): { canStartNewCall: boolean; canReceiveNewCall: boolean } {
  const { canStartNewCall, canReceiveNewCall } = useCallV3Store.getState();
  return { canStartNewCall, canReceiveNewCall };
}
