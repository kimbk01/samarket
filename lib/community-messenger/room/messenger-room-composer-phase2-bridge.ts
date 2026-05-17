"use client";

import type { MessengerRoomPhase2ComposerViewModel } from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";

export type MessengerRoomComposerPhase2Bridge = Pick<
  MessengerRoomPhase2ComposerViewModel,
  | "sendMessage"
  | "setActiveSheet"
  | "voiceRecording"
  | "voiceMicArming"
  | "voiceHandsFree"
  | "voiceRecordElapsedMs"
  | "voiceLivePreviewBars"
  | "voiceCancelHint"
  | "voiceLockHint"
  | "finalizeVoiceRecording"
  | "onVoiceMicPointerDown"
  | "onVoiceMicPointerMove"
  | "onVoiceMicPointerUp"
  | "onVoiceMicPointerCancel"
>;

let bridge: MessengerRoomComposerPhase2Bridge | null = null;
const readyListeners = new Set<() => void>();

export function registerMessengerRoomComposerPhase2Bridge(next: MessengerRoomComposerPhase2Bridge): () => void {
  bridge = next;
  for (const listener of readyListeners) listener();
  return () => {
    if (bridge === next) bridge = null;
  };
}

export function getMessengerRoomComposerPhase2Bridge(): MessengerRoomComposerPhase2Bridge | null {
  return bridge;
}

export function subscribeMessengerRoomComposerPhase2BridgeReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}
