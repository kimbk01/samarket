"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CommunityMessengerRoomShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { useVisualViewportMessengerRoomBox } from "@/lib/ui/use-visual-viewport-messenger-room-box";
import { useMessengerRoomPhase2Controller } from "@/lib/community-messenger/room/phase2";
import { MessengerRoomPhase2ViewProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { MessengerRoomPhase2HeaderProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-header-context";
import { MessengerRoomPhase2ComposerProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";
import { MessengerRoomPhase2CallProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-call-context";
import { MessengerRoomMobileViewportProvider } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { CommunityMessengerRoomPhase2Header } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header";
import { CommunityMessengerRoomPhase2AttachmentsAndTrade } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2AttachmentsAndTrade";
import { CommunityMessengerRoomPhase2MessageTimeline } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline";
import { CommunityMessengerRoomPhase2MessageOverlays } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageOverlays";
import { CommunityMessengerRoomPhase2Composer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer";
import { CommunityMessengerRoomPhase2RoomSheets } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets";
import { CommunityMessengerRoomPhase2MemberActionModal } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal";
import { CommunityMessengerRoomPhase2CallLayer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2CallLayer";
import { useCommunityMessengerRoomTypingRuntime } from "@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing";
import {
  recordRouteEntryElapsedMetric,
  recordRouteEntryMetric,
  recordRouteEntryFirstContentRender,
  recordRouteEntryFirstInteractive,
  recordRouteEntryFullRender,
  scheduleRouteEntryToPaint,
} from "@/lib/runtime/samarket-runtime-debug";

type MessengerRoomPhase2Controller = ReturnType<typeof useMessengerRoomPhase2Controller>;

type CommunityMessengerRoomClientPhase2MainProps = {
  room: MessengerRoomPhase2Controller & {
    snapshot: NonNullable<MessengerRoomPhase2Controller["snapshot"]>;
  };
  keyboardOverlapSuppressed: boolean;
  mobileShellStyle: { maxHeight: number } | undefined;
};

function CommunityMessengerRoomClientPhase2Main({
  room,
  keyboardOverlapSuppressed,
  mobileShellStyle,
}: CommunityMessengerRoomClientPhase2MainProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const phase2EnterRecordedRef = useRef(false);
  const roomStateCommitRecordedRef = useRef(false);
  const messagesStateCommitRecordedRef = useRef(false);
  const participantsStateCommitRecordedRef = useRef(false);
  const profilesStateCommitRecordedRef = useRef(false);
  const firstMessageRenderRecordedRef = useRef(false);
  const fullMessageListRenderRecordedRef = useRef(false);
  const inputReadyRecordedRef = useRef(false);
  const renderCountRef = useRef(0);
  const layoutEffectRunCountRef = useRef(0);
  const effectRunCountRef = useRef(0);
  renderCountRef.current += 1;
  recordRouteEntryMetric("messenger_room_entry", "phase2_rerender_count", Math.max(0, renderCountRef.current - 1));
  const view: MessengerRoomPhase2ViewModel = {
    ...room,
    snapshot: room.snapshot as CommunityMessengerRoomSnapshot,
  };
  const headerView = useMemo(
    () => ({
      snapshot: view.snapshot,
      roomHeaderStatus: view.roomHeaderStatus,
      router: view.router,
      isGroupRoom: view.isGroupRoom,
      t: view.t,
      roomUnavailable: view.roomUnavailable,
      outgoingDialLocked: view.outgoingDialLocked,
      setActiveSheet: view.setActiveSheet,
      startManagedDirectCall: view.startManagedDirectCall,
    }),
    [
      view.snapshot,
      view.roomHeaderStatus,
      view.router,
      view.isGroupRoom,
      view.t,
      view.roomUnavailable,
      view.outgoingDialLocked,
      view.setActiveSheet,
      view.startManagedDirectCall,
    ]
  );
  const composerView = useMemo(
    () => ({
      snapshot: view.snapshot,
      message: view.message,
      roomUnavailable: view.roomUnavailable,
      busy: view.busy,
      sendMessage: view.sendMessage,
      setActiveSheet: view.setActiveSheet,
      composerTextareaRef: view.composerTextareaRef,
      voiceRecording: view.voiceRecording,
      voiceMicArming: view.voiceMicArming,
      voiceHandsFree: view.voiceHandsFree,
      voiceRecordElapsedMs: view.voiceRecordElapsedMs,
      voiceLivePreviewBars: view.voiceLivePreviewBars,
      voiceCancelHint: view.voiceCancelHint,
      voiceLockHint: view.voiceLockHint,
      finalizeVoiceRecording: view.finalizeVoiceRecording,
      onVoiceMicPointerDown: view.onVoiceMicPointerDown,
      onVoiceMicPointerMove: view.onVoiceMicPointerMove,
      onVoiceMicPointerUp: view.onVoiceMicPointerUp,
      onVoiceMicPointerCancel: view.onVoiceMicPointerCancel,
    }),
    [
      view.snapshot,
      view.message,
      view.roomUnavailable,
      view.busy,
      view.sendMessage,
      view.setActiveSheet,
      view.composerTextareaRef,
      view.voiceRecording,
      view.voiceMicArming,
      view.voiceHandsFree,
      view.voiceRecordElapsedMs,
      view.voiceLivePreviewBars,
      view.voiceCancelHint,
      view.voiceLockHint,
      view.finalizeVoiceRecording,
      view.onVoiceMicPointerDown,
      view.onVoiceMicPointerMove,
      view.onVoiceMicPointerUp,
      view.onVoiceMicPointerCancel,
    ]
  );
  const callView = useMemo(
    () => ({
      returnToCallSessionId: view.returnToCallSessionId,
      isGroupRoom: view.isGroupRoom,
      call: view.call,
      t: view.t,
      tt: view.tt,
      permissionGuide: view.permissionGuide,
      openCallPermissionHelp: view.openCallPermissionHelp,
      retryCallDevicePermission: view.retryCallDevicePermission,
      handleAcceptIncomingCall: view.handleAcceptIncomingCall,
      snapshot: view.snapshot,
      router: view.router,
    }),
    [
      view.returnToCallSessionId,
      view.isGroupRoom,
      view.call,
      view.t,
      view.tt,
      view.permissionGuide,
      view.openCallPermissionHelp,
      view.retryCallDevicePermission,
      view.handleAcceptIncomingCall,
      view.snapshot,
      view.router,
    ]
  );

  useLayoutEffect(() => {
    layoutEffectRunCountRef.current += 1;
    recordRouteEntryMetric(
      "messenger_room_entry",
      "phase2_use_layout_effect_count",
      layoutEffectRunCountRef.current
    );
    if (!phase2EnterRecordedRef.current) {
      phase2EnterRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "phase2_enter_ms");
    }
  }, []);

  useLayoutEffect(() => {
    layoutEffectRunCountRef.current += 1;
    recordRouteEntryMetric(
      "messenger_room_entry",
      "phase2_use_layout_effect_count",
      layoutEffectRunCountRef.current
    );
    if (!roomStateCommitRecordedRef.current && room.snapshot?.room.id) {
      roomStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "json_parse_complete_ms");
      recordRouteEntryElapsedMetric("messenger_room_entry", "room_state_commit_ms");
    }
    if (!messagesStateCommitRecordedRef.current && room.roomMessages.length > 0) {
      messagesStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "messages_state_commit_ms");
    }
    if (!participantsStateCommitRecordedRef.current && room.snapshot.members.length > 0) {
      participantsStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "participants_state_commit_ms");
    }
    if (!profilesStateCommitRecordedRef.current && room.roomMembersDisplay.length > 0) {
      profilesStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "profiles_state_commit_ms");
    }
  }, [room.roomMembersDisplay.length, room.roomMessages.length, room.snapshot]);

  useLayoutEffect(() => {
    layoutEffectRunCountRef.current += 1;
    recordRouteEntryMetric(
      "messenger_room_entry",
      "phase2_use_layout_effect_count",
      layoutEffectRunCountRef.current
    );
    const initialRenderedCount = room.chatVirtualizer.getVirtualItems().length;
    if (firstMessageRenderRecordedRef.current) return;
    if (room.displayRoomMessages.length <= 0 || initialRenderedCount <= 0) return;
    firstMessageRenderRecordedRef.current = true;
    recordRouteEntryElapsedMetric("messenger_room_entry", "first_message_render_ms");
    recordRouteEntryMetric("messenger_room_entry", "initial_rendered_message_count", initialRenderedCount);
    recordRouteEntryFirstContentRender("messenger_room_entry");
    scheduleRouteEntryToPaint("messenger_room_entry");
  }, [room.chatVirtualizer, room.displayRoomMessages.length]);

  useLayoutEffect(() => {
    layoutEffectRunCountRef.current += 1;
    recordRouteEntryMetric(
      "messenger_room_entry",
      "phase2_use_layout_effect_count",
      layoutEffectRunCountRef.current
    );
    if (fullMessageListRenderRecordedRef.current) return;
    if (room.displayRoomMessages.length <= 0) return;
    if (room.snapshot.messages.length <= 0) return;
    if (room.displayRoomMessages.length < room.snapshot.messages.length) return;
    fullMessageListRenderRecordedRef.current = true;
    recordRouteEntryElapsedMetric("messenger_room_entry", "full_message_list_render_ms");
    recordRouteEntryMetric("messenger_room_entry", "message_render_count", room.displayRoomMessages.length);
    recordRouteEntryMetric("messenger_room_entry", "image_attachment_count", room.photoMessageCount);
    recordRouteEntryFullRender("messenger_room_entry");
  }, [room.displayRoomMessages.length, room.photoMessageCount, room.snapshot.messages.length]);

  useEffect(() => {
    effectRunCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "phase2_use_effect_count", effectRunCountRef.current);
    const root = rootRef.current;
    if (!root || inputReadyRecordedRef.current) return;
    const composer = root.querySelector("textarea");
    if (composer instanceof HTMLTextAreaElement) {
      inputReadyRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "input_ready_ms");
      recordRouteEntryFirstInteractive("messenger_room_entry");
    }
  }, [room.displayRoomMessages.length]);

  return (
    <MessengerRoomMobileViewportProvider value={{ keyboardOverlapSuppressed }}>
      <MessengerRoomPhase2ViewProvider value={view}>
        <div
          ref={rootRef}
          data-messenger-shell
          data-cm-room
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]"
          style={mobileShellStyle}
        >
          <MessengerRoomPhase2HeaderProvider value={headerView}>
            <CommunityMessengerRoomPhase2Header />
          </MessengerRoomPhase2HeaderProvider>
          <CommunityMessengerRoomPhase2AttachmentsAndTrade />
          <CommunityMessengerRoomPhase2MessageTimeline />
          <CommunityMessengerRoomPhase2MessageOverlays />
          <MessengerRoomPhase2ComposerProvider value={composerView}>
            <CommunityMessengerRoomPhase2Composer />
          </MessengerRoomPhase2ComposerProvider>
          <CommunityMessengerRoomPhase2RoomSheets />
          <CommunityMessengerRoomPhase2MemberActionModal />
          <MessengerRoomPhase2CallProvider value={callView}>
            <CommunityMessengerRoomPhase2CallLayer />
          </MessengerRoomPhase2CallProvider>
        </div>
      </MessengerRoomPhase2ViewProvider>
    </MessengerRoomMobileViewportProvider>
  );
}

export function CommunityMessengerRoomClientPhase2() {
  const room = useMessengerRoomPhase2Controller();
  useCommunityMessengerRoomTypingRuntime({
    roomId: room.snapshot?.room.id ?? null,
    viewerUserId: room.snapshot?.viewerUserId ?? null,
    peerUserId: room.snapshot?.room.peerUserId ?? null,
  });
  const isNarrowViewport = useMatchMaxWidthMd();
  const vvBox = useVisualViewportMessengerRoomBox(isNarrowViewport);
  const keyboardOverlapSuppressed = Boolean(isNarrowViewport && vvBox);
  const mobileShellStyle =
    isNarrowViewport && vvBox
      ? ({ maxHeight: vvBox.heightPx } as const)
      : undefined;

  if (room.loading && !room.snapshot) {
    return <CommunityMessengerRoomShellSkeleton />;
  }

  if (!room.snapshot) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[16px] font-semibold text-ui-fg">채팅방을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => room.router.replace("/community-messenger?section=chats")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 text-[14px] font-semibold text-ui-surface"
        >
          {room.t("nav_messenger_home")}
        </button>
      </div>
    );
  }

  const snapshot = room.snapshot;
  return (
    <CommunityMessengerRoomClientPhase2Main
      room={{ ...room, snapshot }}
      keyboardOverlapSuppressed={keyboardOverlapSuppressed}
      mobileShellStyle={mobileShellStyle}
    />
  );
}
