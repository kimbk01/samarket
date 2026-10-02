"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";

export type MessengerRoomPhase2ComposerViewModel = Pick<
  MessengerRoomPhase2ViewModel,
  | "snapshot"
  | "message"
  | "roomUnavailable"
  | "busy"
  | "sendMessage"
  | "setActiveSheet"
  | "composerTextareaRef"
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

const MessengerRoomPhase2ComposerContext = createContext<MessengerRoomPhase2ComposerViewModel | null>(null);

export function MessengerRoomPhase2ComposerProvider({
  value,
  children,
}: {
  value: MessengerRoomPhase2ComposerViewModel;
  children: ReactNode;
}) {
  return (
    <MessengerRoomPhase2ComposerContext.Provider value={value}>{children}</MessengerRoomPhase2ComposerContext.Provider>
  );
}

export function useMessengerRoomPhase2ComposerView(): MessengerRoomPhase2ComposerViewModel {
  const value = useContext(MessengerRoomPhase2ComposerContext);
  if (!value) throw new Error("useMessengerRoomPhase2ComposerView: provider missing");
  return value;
}
