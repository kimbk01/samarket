"use client";

import { create } from "zustand";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

type CallV4StoreState = {
  phase: CallV4Phase;
  identity: CallV4Identity | null;
  connectedAt: number | null;
  setPhase: (phase: CallV4Phase) => void;
  setIdentity: (identity: CallV4Identity | null) => void;
  resetToIdle: () => void;
};

export const useCallV4Store = create<CallV4StoreState>((set) => ({
  phase: "idle",
  identity: null,
  connectedAt: null,
  setPhase: (phase) => set({ phase }),
  setIdentity: (identity) => set({ identity }),
  resetToIdle: () =>
    set({
      phase: "idle",
      identity: null,
      connectedAt: null,
    }),
}));

export function readCallV4Phase(): CallV4Phase {
  return useCallV4Store.getState().phase;
}

export function readCallV4Identity(): CallV4Identity | null {
  return useCallV4Store.getState().identity;
}
