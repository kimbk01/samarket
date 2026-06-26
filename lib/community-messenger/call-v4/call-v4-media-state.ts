"use client";

import { create } from "zustand";
import type { CallV4ConnectionSignalTier, CallV4MediaType } from "@/lib/community-messenger/call-v4/call-v4-types";

export type CallV4MediaSnapshot = {
  micEnabled: boolean;
  speakerEnabled: boolean;
  cameraEnabled: boolean;
  localVideoMinimized: boolean;
  localVideoReady: boolean;
  remoteVideoReady: boolean;
  incomingVideoUpgradeRequest: boolean;
  pendingVideoUpgradeRequest: boolean;
  connectionSignalTier: CallV4ConnectionSignalTier | null;
};

type CallV4MediaState = CallV4MediaSnapshot & {
  setMicEnabled: (enabled: boolean) => void;
  setSpeakerEnabled: (enabled: boolean) => void;
  setCameraEnabled: (enabled: boolean) => void;
  setLocalVideoMinimized: (minimized: boolean) => void;
  setLocalVideoReady: (ready: boolean) => void;
  setRemoteVideoReady: (ready: boolean) => void;
  setIncomingVideoUpgradeRequest: (value: boolean) => void;
  setPendingVideoUpgradeRequest: (value: boolean) => void;
  setConnectionSignalTier: (tier: CallV4ConnectionSignalTier | null) => void;
  reset: () => void;
};

const defaults = {
  micEnabled: true,
  speakerEnabled: false,
  cameraEnabled: true,
  localVideoMinimized: false,
  localVideoReady: false,
  remoteVideoReady: false,
  incomingVideoUpgradeRequest: false,
  pendingVideoUpgradeRequest: false,
  connectionSignalTier: null,
} as const;

export const useCallV4MediaStore = create<CallV4MediaState>((set) => ({
  ...defaults,
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setSpeakerEnabled: (speakerEnabled) => set({ speakerEnabled }),
  setCameraEnabled: (cameraEnabled) => set({ cameraEnabled }),
  setLocalVideoMinimized: (localVideoMinimized) => set({ localVideoMinimized }),
  setLocalVideoReady: (localVideoReady) => set({ localVideoReady }),
  setRemoteVideoReady: (remoteVideoReady) => set({ remoteVideoReady }),
  setIncomingVideoUpgradeRequest: (incomingVideoUpgradeRequest) => set({ incomingVideoUpgradeRequest }),
  setPendingVideoUpgradeRequest: (pendingVideoUpgradeRequest) => set({ pendingVideoUpgradeRequest }),
  setConnectionSignalTier: (connectionSignalTier) => set({ connectionSignalTier }),
  reset: () => set({ ...defaults }),
}));

/** 연결 전 UI 스피커 기본: 음성 OFF · 영상 ON */
export function seedCallV4MediaPresentationForCall(mediaType: CallV4MediaType): void {
  useCallV4MediaStore.getState().setSpeakerEnabled(mediaType === "video");
}

export function readCallV4MediaState() {
  return useCallV4MediaStore.getState();
}
