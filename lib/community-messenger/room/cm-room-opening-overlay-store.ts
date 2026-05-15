"use client";

import { create } from "zustand";

export type CmRoomOpeningOverlayPhase = "idle" | "overlay" | "handoff" | "done";

export type CmRoomOpeningOverlayState = {
  openingRoomId: string | null;
  startedAt: number;
  shellVisibleAt: number;
  overlayMounted: boolean;
  routeTransitionStartedAt: number;
  routeMountedAt: number;
  hydrationCompleteAt: number;
  handoffAt: number;
  phase: CmRoomOpeningOverlayPhase;
  beginOpening: (roomId: string) => void;
  noteOverlayVisible: () => void;
  noteRouteTransitionStarted: () => void;
  noteRouteMounted: (roomId: string) => void;
  noteHydrationComplete: (roomId: string) => void;
  beginHandoff: (roomId: string) => void;
  reset: (reason?: string) => void;
};

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const initialTimings = {
  openingRoomId: null as string | null,
  startedAt: 0,
  shellVisibleAt: 0,
  overlayMounted: false,
  routeTransitionStartedAt: 0,
  routeMountedAt: 0,
  hydrationCompleteAt: 0,
  handoffAt: 0,
  phase: "idle" as CmRoomOpeningOverlayPhase,
};

export const useCmRoomOpeningOverlayStore = create<CmRoomOpeningOverlayState>((set, get) => ({
  ...initialTimings,
  beginOpening: (roomId) => {
    const id = String(roomId ?? "").trim();
    if (!id) return;
    set({
      ...initialTimings,
      openingRoomId: id,
      startedAt: perfNow(),
      phase: "overlay",
    });
  },
  noteOverlayVisible: () => {
    const s = get();
    if (!s.openingRoomId || s.shellVisibleAt > 0) return;
    set({ shellVisibleAt: perfNow(), overlayMounted: true });
  },
  noteRouteTransitionStarted: () => {
    const s = get();
    if (!s.openingRoomId || s.routeTransitionStartedAt > 0) return;
    set({ routeTransitionStartedAt: perfNow() });
  },
  noteRouteMounted: (roomId) => {
    const id = String(roomId ?? "").trim();
    const s = get();
    if (!id || s.openingRoomId !== id || s.routeMountedAt > 0) return;
    set({ routeMountedAt: perfNow() });
  },
  noteHydrationComplete: (roomId) => {
    const id = String(roomId ?? "").trim();
    const s = get();
    if (!id || s.openingRoomId !== id || s.hydrationCompleteAt > 0) return;
    set({ hydrationCompleteAt: perfNow() });
  },
  beginHandoff: (roomId) => {
    const id = String(roomId ?? "").trim();
    const s = get();
    if (!id || s.openingRoomId !== id || s.phase === "handoff" || s.phase === "done") return;
    set({ phase: "handoff", handoffAt: perfNow() });
  },
  reset: () => {
    set({ ...initialTimings });
  },
}));

export function getCmRoomOpeningOverlayRoomId(): string | null {
  return useCmRoomOpeningOverlayStore.getState().openingRoomId;
}

export function isCmPreRouteShellOverlayActiveForRoom(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id) return false;
  const s = useCmRoomOpeningOverlayStore.getState();
  return s.openingRoomId === id && (s.phase === "overlay" || s.phase === "handoff");
}

export function shouldSkipInRoutePass0ForPreRouteOverlay(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id) return false;
  const s = useCmRoomOpeningOverlayStore.getState();
  return s.openingRoomId === id && s.phase === "overlay";
}
