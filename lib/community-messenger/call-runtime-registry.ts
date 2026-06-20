"use client";

import type { ReactNode } from "react";
import type { VideoCallPipLayoutBindings } from "@/components/messenger/call/call-ui.types";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CallPresentationMode = "fullscreen" | "dock" | "pip-minimized" | "idle";

export type CommunityMessengerCallRuntimeHandle = {
  sessionId: string;
  session: CommunityMessengerCallSession | null;
  /** Agora leave·트랙 stop·톤 정지 */
  cleanupMedia: () => Promise<void>;
  /** active/ringing 세션 best-effort 종료 */
  patchTerminalBestEffort: (reason: "logout" | "account_switch") => Promise<void>;
};

export type CommunityMessengerCallRuntimeSurface = {
  presentation: CallPresentationMode;
  videoPipLayout: VideoCallPipLayoutBindings | null;
  miniVideoSlot: ReactNode | null;
  dockContent: ReactNode | null;
  expandToFullscreen: (() => void) | null;
  minimizeToDock: (() => void) | null;
  minimizeToPip: (() => void) | null;
};

const IDLE_SURFACE: CommunityMessengerCallRuntimeSurface = {
  presentation: "idle",
  videoPipLayout: null,
  miniVideoSlot: null,
  dockContent: null,
  expandToFullscreen: null,
  minimizeToDock: null,
  minimizeToPip: null,
};

let activeHandle: CommunityMessengerCallRuntimeHandle | null = null;
let runtimeSurface: CommunityMessengerCallRuntimeSurface = { ...IDLE_SURFACE };
const surfaceListeners = new Set<() => void>();

function notifySurfaceListeners(): void {
  for (const listener of surfaceListeners) {
    listener();
  }
}

export function registerCommunityMessengerCallRuntime(handle: CommunityMessengerCallRuntimeHandle): () => void {
  activeHandle = handle;
  return () => {
    if (activeHandle === handle) activeHandle = null;
  };
}

export function getCommunityMessengerCallRuntime(): CommunityMessengerCallRuntimeHandle | null {
  return activeHandle;
}

export function syncCommunityMessengerCallRuntimeSurface(
  patch: Partial<CommunityMessengerCallRuntimeSurface>
): void {
  runtimeSurface = { ...runtimeSurface, ...patch };
  notifySurfaceListeners();
}

export function resetCommunityMessengerCallRuntimeSurface(): void {
  runtimeSurface = { ...IDLE_SURFACE };
  notifySurfaceListeners();
}

export function getCommunityMessengerCallRuntimeSurface(): CommunityMessengerCallRuntimeSurface {
  return runtimeSurface;
}

export function subscribeCommunityMessengerCallRuntimeSurface(listener: () => void): () => void {
  surfaceListeners.add(listener);
  return () => {
    surfaceListeners.delete(listener);
  };
}
