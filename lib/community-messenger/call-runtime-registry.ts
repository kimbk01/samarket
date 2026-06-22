"use client";

import type { ReactNode } from "react";
import type { VideoCallPipLayoutBindings } from "@/components/messenger/call/call-ui.types";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { resetCallDockPresentation } from "@/lib/community-messenger/call-dock-presentation";
import { shouldBlockCallRuntimeSurfaceReset } from "@/lib/community-messenger/call-presentation-surface";

export type CallPresentationMode = "fullscreen" | "minimized" | "dock" | "idle";

export type CallDockSnapshot = {
  peerLabel: string;
  peerAvatarUrl: string | null;
  statusText: string;
  timerText: string | null;
  micMuted: boolean;
  cameraOff: boolean;
  isVideo: boolean;
  videoThumbSlot: ReactNode | null;
  remoteVideoThumbSlot?: ReactNode | null;
  useSplitPreview?: boolean;
};

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
  expandToFullscreen: (() => void) | null;
  minimizeToPip: (() => void) | null;
  minimizeToDock: (() => void) | null;
  dockSnapshot: CallDockSnapshot | null;
  onDockExpand: (() => void) | null;
  onDockEnd: (() => void) | null;
  onDockToggleMute: (() => void) | null;
};

const IDLE_SURFACE: CommunityMessengerCallRuntimeSurface = {
  presentation: "idle",
  videoPipLayout: null,
  miniVideoSlot: null,
  expandToFullscreen: null,
  minimizeToPip: null,
  minimizeToDock: null,
  dockSnapshot: null,
  onDockExpand: null,
  onDockEnd: null,
  onDockToggleMute: null,
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
  if (shouldBlockCallRuntimeSurfaceReset()) return;
  runtimeSurface = { ...IDLE_SURFACE };
  notifySurfaceListeners();
}

/** terminal 종료 등 — retained Dock/PiP 무시하고 강제 idle */
export function forceResetCommunityMessengerCallRuntimeSurface(): void {
  resetCallDockPresentation();
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
