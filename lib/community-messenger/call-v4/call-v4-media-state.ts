"use client";

import { create } from "zustand";

export type CallV4MediaSnapshot = {
  micEnabled: boolean;
  speakerEnabled: boolean;
  cameraEnabled: boolean;
  localVideoMinimized: boolean;
  localVideoReady: boolean;
  remoteVideoReady: boolean;
  incomingVideoUpgradeRequest: boolean;
  pendingVideoUpgradeRequest: boolean;
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
  reset: () => void;
};

const defaults = {
  micEnabled: true,
  speakerEnabled: true,
  cameraEnabled: true,
  localVideoMinimized: false,
  localVideoReady: false,
  remoteVideoReady: false,
  incomingVideoUpgradeRequest: false,
  pendingVideoUpgradeRequest: false,
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
  reset: () => set({ ...defaults }),
}));

export function readCallV4MediaState() {
  return useCallV4MediaStore.getState();
}
