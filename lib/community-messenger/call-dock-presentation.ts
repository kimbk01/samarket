"use client";

import {
  readDockedCallSessionId,
  readAndroidOsPipCallSessionId,
} from "@/lib/community-messenger/call-presentation-ownership";
import {
  readActiveCallPresentationSurface,
  type CallPresentationSurface,
} from "@/lib/community-messenger/call-presentation-surface";
import { CALL_DOCK_TRANSITION_MS } from "@/lib/community-messenger/call-ui/call-dock-theme";

export type CallDockVisualPhase = "hidden" | "entering" | "visible" | "exiting";

type CallDockPresentationState = {
  visualPhase: CallDockVisualPhase;
  restoreInFlight: boolean;
  /** dockCommunityCall 전 crossfade mount용 */
  pendingSessionId: string | null;
};

let state: CallDockPresentationState = {
  visualPhase: "hidden",
  restoreInFlight: false,
  pendingSessionId: null,
};

const listeners = new Set<() => void>();

function notifyCallDockPresentationListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setCallDockPresentationState(patch: Partial<CallDockPresentationState>): void {
  state = { ...state, ...patch };
  notifyCallDockPresentationListeners();
}

export function getCallDockPresentationState(): CallDockPresentationState {
  return state;
}

export function subscribeCallDockPresentation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCallDockLayerSessionId(): string | null {
  return readDockedCallSessionId() ?? state.pendingSessionId;
}

function isAndroidOsPipActive(): boolean {
  return Boolean(readAndroidOsPipCallSessionId());
}

export function shouldShowCallDockLayer(): boolean {
  if (isAndroidOsPipActive()) return false;
  const surface = readActiveCallPresentationSurface();
  if (surface === "ANDROID_OS_PIP" || surface === "IOS_NATIVE_PIP") return false;
  if (surface === "DOCK") return true;
  if (state.pendingSessionId) return true;
  return state.visualPhase === "entering" || state.visualPhase === "visible" || state.visualPhase === "exiting";
}

export function isCallDockLayerVisible(): boolean {
  return state.visualPhase === "visible" || state.visualPhase === "entering";
}

export function shouldSuppressCallOverlayToasts(): boolean {
  const surface = readActiveCallPresentationSurface();
  if (surface === "DOCK" || surface === "ANDROID_OS_PIP" || surface === "IOS_NATIVE_PIP") return true;
  return state.visualPhase !== "hidden" || Boolean(state.pendingSessionId) || state.restoreInFlight;
}

export function isCallDockRestoreInFlight(): boolean {
  return state.restoreInFlight;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Full → Dock: Dock 먼저 mount(opacity 0) → crossfade in → flags */
export async function beginDockEnterTransition(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  if (!sid || isAndroidOsPipActive()) return;
  if (state.restoreInFlight) return;
  setCallDockPresentationState({
    pendingSessionId: sid,
    visualPhase: "entering",
    restoreInFlight: false,
  });
  await nextFrame();
  await nextFrame();
  setCallDockPresentationState({ visualPhase: "visible" });
}

export function commitDockEnterTransition(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  setCallDockPresentationState({
    pendingSessionId: null,
    visualPhase: "visible",
  });
}

/** Dock → Full: restore lock → full restore → Dock exit animation → hidden */
export function tryBeginFullscreenRestoreFromDock(): boolean {
  if (state.restoreInFlight) return false;
  setCallDockPresentationState({ restoreInFlight: true, visualPhase: "exiting" });
  return true;
}

export async function finishFullscreenRestoreFromDock(): Promise<void> {
  await sleepMs(CALL_DOCK_TRANSITION_MS);
  setCallDockPresentationState({
    visualPhase: "hidden",
    restoreInFlight: false,
    pendingSessionId: null,
  });
}

export function resetCallDockPresentation(): void {
  setCallDockPresentationState({
    visualPhase: "hidden",
    restoreInFlight: false,
    pendingSessionId: null,
  });
}

export function assertPresentationSurfaceExclusive(surface: CallPresentationSurface): boolean {
  if (surface === "ANDROID_OS_PIP") return !readDockedCallSessionId();
  if (surface === "DOCK") return !readAndroidOsPipCallSessionId();
  return true;
}
