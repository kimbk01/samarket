"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { useMessengerRoomClientPhase1ContextOptional } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import type { MessengerRoomPhase2ComposerViewModel } from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";
import {
  getMessengerRoomComposerPhase2Bridge,
  subscribeMessengerRoomComposerPhase2BridgeReady,
} from "@/lib/community-messenger/room/messenger-room-composer-phase2-bridge";
import { recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";

const VOICE_IDLE: Pick<
  MessengerRoomPhase2ComposerViewModel,
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
> = {
  voiceRecording: false,
  voiceMicArming: false,
  voiceHandsFree: false,
  voiceRecordElapsedMs: 0,
  voiceLivePreviewBars: [],
  voiceCancelHint: false,
  voiceLockHint: false,
  finalizeVoiceRecording: async () => {},
  onVoiceMicPointerDown: async () => {},
  onVoiceMicPointerMove: async () => {},
  onVoiceMicPointerUp: async () => {},
  onVoiceMicPointerCancel: async () => {},
};

function noteComposerSurfaceContractMetrics(): void {
  recordRouteEntryMetric("messenger_room_entry", "composer_waited_for_timeline", 0);
  recordRouteEntryMetric("messenger_room_entry", "composer_waited_for_virtualizer", 0);
  recordRouteEntryMetric("messenger_room_entry", "composer_waited_for_voice", 0);
  recordRouteEntryMetric("messenger_room_entry", "composer_surface_source_phase1", 1);
}

/**
 * Phase1 room seed만으로 composer surface VM — timeline/virtualizer/voice/controller 미대기.
 */
export function useMessengerRoomComposerSurface(): MessengerRoomPhase2ComposerViewModel | null {
  const phase1 = useMessengerRoomClientPhase1ContextOptional();
  if (!phase1) return null;
  const {
    snapshot,
    message,
    setMessage,
    busy,
    setActiveSheet,
    composerTextareaRef,
    setReplyToMessage,
  } = phase1;
  const pendingTextSendsRef = useRef<string[]>([]);
  const [, bumpBridge] = useState(0);

  useEffect(() => {
    noteComposerSurfaceContractMetrics();
    return subscribeMessengerRoomComposerPhase2BridgeReady(() => {
      bumpBridge((n) => n + 1);
    });
  }, []);

  const roomUnavailable = useMemo(() => {
    if (!snapshot) return true;
    const tradeSendBlocked = Boolean(
      snapshot.tradeMessaging && snapshot.tradeMessaging.canSendMessage === false
    );
    return !communityMessengerRoomIsGloballyUsable(snapshot.room) || tradeSendBlocked;
  }, [snapshot]);

  const flushPendingSends = useCallback(
    (send: (text?: string) => Promise<boolean>) => {
      const queued = pendingTextSendsRef.current.splice(0);
      for (const text of queued) {
        void send(text);
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (textOverride?: string): Promise<boolean> => {
      const bridge = getMessengerRoomComposerPhase2Bridge();
      const raw = (textOverride ?? message).trim();
      if (!raw || !snapshot) return false;
      if (bridge) {
        return bridge.sendMessage(textOverride);
      }
      setMessage("");
      setReplyToMessage(null);
      pendingTextSendsRef.current.push(raw);
      return true;
    },
    [message, setMessage, setReplyToMessage, snapshot]
  );

  useEffect(() => {
    const bridge = getMessengerRoomComposerPhase2Bridge();
    if (!bridge) return;
    flushPendingSends(bridge.sendMessage);
  }, [flushPendingSends, busy, snapshot?.room.id]);

  if (!snapshot) return null;

  const bridge = getMessengerRoomComposerPhase2Bridge();
  const voice = bridge
    ? {
        voiceRecording: bridge.voiceRecording,
        voiceMicArming: bridge.voiceMicArming,
        voiceHandsFree: bridge.voiceHandsFree,
        voiceRecordElapsedMs: bridge.voiceRecordElapsedMs,
        voiceLivePreviewBars: bridge.voiceLivePreviewBars,
        voiceCancelHint: bridge.voiceCancelHint,
        voiceLockHint: bridge.voiceLockHint,
        finalizeVoiceRecording: bridge.finalizeVoiceRecording,
        onVoiceMicPointerDown: bridge.onVoiceMicPointerDown,
        onVoiceMicPointerMove: bridge.onVoiceMicPointerMove,
        onVoiceMicPointerUp: bridge.onVoiceMicPointerUp,
        onVoiceMicPointerCancel: bridge.onVoiceMicPointerCancel,
      }
    : VOICE_IDLE;

  return {
    snapshot,
    message,
    roomUnavailable,
    busy,
    sendMessage,
    setActiveSheet: bridge?.setActiveSheet ?? setActiveSheet,
    composerTextareaRef,
    ...voice,
  };
}
