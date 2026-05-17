"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { buildClientShellPlaceholderSnapshot } from "@/lib/community-messenger/room/client-shell-placeholder-snapshot";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
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

/** Phase1 full hook 이전 — placeholder·peek 스냅샷만으로 composer VM (R2-M8). */
export function useMessengerRoomComposerEarly({
  roomId,
  initialViewerUserId,
}: {
  roomId: string;
  initialViewerUserId?: string | null;
}): MessengerRoomPhase2ComposerViewModel {
  const rid = roomId.trim();
  const viewerId = initialViewerUserId?.trim() ?? "";
  const [snapshot, setSnapshot] = useState(() => {
    const peek = rid ? peekRoomSnapshot(rid, viewerId || undefined) : null;
    return peek ?? buildClientShellPlaceholderSnapshot(rid, viewerId || undefined);
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingTextSendsRef = useRef<string[]>([]);
  const [, bumpBridge] = useState(0);

  useEffect(() => {
    if (!rid) return;
    const peek = peekRoomSnapshot(rid, viewerId || undefined);
    if (peek) setSnapshot(peek);
  }, [rid, viewerId]);

  useEffect(() => {
    noteComposerSurfaceContractMetrics();
    return subscribeMessengerRoomComposerPhase2BridgeReady(() => {
      bumpBridge((n) => n + 1);
    });
  }, []);

  const roomUnavailable = useMemo(() => {
    const tradeSendBlocked = Boolean(
      snapshot.tradeMessaging && snapshot.tradeMessaging.canSendMessage === false
    );
    return !communityMessengerRoomIsGloballyUsable(snapshot.room) || tradeSendBlocked;
  }, [snapshot]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const bridge = getMessengerRoomComposerPhase2Bridge();
      const raw = (textOverride ?? message).trim();
      if (!raw) return;
      if (bridge) {
        await bridge.sendMessage(textOverride);
        return;
      }
      setMessage("");
      pendingTextSendsRef.current.push(raw);
    },
    [message]
  );

  useEffect(() => {
    const bridge = getMessengerRoomComposerPhase2Bridge();
    if (!bridge) return;
    const queued = pendingTextSendsRef.current.splice(0);
    for (const text of queued) {
      void bridge.sendMessage(text);
    }
  }, [busy, snapshot.room.id]);

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
    setActiveSheet: bridge?.setActiveSheet ?? (() => undefined),
    composerTextareaRef,
    ...voice,
  };
}
