"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { noteCmRoomPhase2HydratedModuleEval } from "@/lib/community-messenger/room/cm-room-phase2-entry-perf";

noteCmRoomPhase2HydratedModuleEval();
import { CommunityMessengerRoomShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { useMessengerTradeKeyboardChrome } from "@/lib/ui/use-messenger-trade-keyboard-chrome";
import { useChatViewportShellInsets } from "@/lib/ui/use-chat-viewport-shell-insets";
import {
  resolveChatViewportShellClassNames,
  resolveChatViewportShellPlatform,
  type ChatViewportShellLayoutMode,
} from "@/lib/ui/chat-viewport-shell-platform";
import { useOwnerOrderChatSlideHost } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { useBuyerOrderChatSlideHost } from "@/components/mypage/BuyerOrderChatSlideHostContext";
import { useMessengerUIStore } from "@/lib/community-messenger/stores/useMessengerUIStore";
import { useMessengerRoomPhase2Controller } from "@/lib/community-messenger/room/phase2";
import { MessengerRoomPhase2ViewProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { MessengerRoomPhase2HeaderProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-header-context";
import { MessengerRoomPhase2CallProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-call-context";
import { MessengerRoomMobileViewportProvider } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { CommunityMessengerRoomPhase2Header } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header";
import { CommunityMessengerRoomPhase2PeerNotice } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice";
import { CommunityMessengerRoomPhase2AttachmentsAndTrade } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2AttachmentsAndTrade";
import { CommunityMessengerRoomPhase2MessageTimeline } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline";
import { CommunityMessengerRoomPhase2MessageOverlays } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageOverlays";
import { CommunityMessengerRoomPhase2RoomSheets } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets";
import { CommunityMessengerRoomPhase2MemberActionModal } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal";
import { CommunityMessengerRoomPhase2CallLayer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2CallLayer";
import { CommunityMessengerRoomPhase2Composer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer";
import { StoreOrderDeliveryRoomProvider } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import {
  MessengerRoomPhase2ComposerProvider,
  type MessengerRoomPhase2ComposerViewModel,
} from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";
import { useCommunityMessengerRoomTypingRuntime } from "@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing";
import {
  recordRouteEntryElapsedMetric,
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryMetric,
  recordRouteEntryFullRender,
  scheduleRouteEntryToPaint,
} from "@/lib/runtime/samarket-runtime-debug";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import {
  finalizeCmRoomEntryShellVisibleMs,
  recordCmRoomEntryMilestone,
  tryEmitCmRoomEntryV2Log,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import {
  cmRenderAnalysisEnabled,
  deriveCmRoomRenderReason,
  disposeCmRenderAnalysisLayoutShiftObserver,
  ensureCmRenderAnalysisLayoutShiftObserver,
  logCmRenderAnalysis,
  resetCmRenderAnalysisSession,
} from "@/lib/community-messenger/monitoring/cm-render-analysis";
import { useMessengerRoomAnimatedBack } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import {
  resolveMessengerRoomBackNavigation,
  runMessengerRoomBackNavigation,
} from "@/lib/community-messenger/room/messenger-room-back-navigation";
import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import {
  isCommunityMessengerStoreOrderDeliveryRoom,
  resolveCommunityMessengerDeliveryContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import { messengerTradeViewerRoleFromContextMeta } from "@/lib/community-messenger/messenger-trade-viewer-role";
import { CmReactCommitProbe, useCmDevRenderTrace, useCmStrictModeEffectProbe } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { logCmRenderRoomEntry } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import {
  CmRoomPhase2HydrationProvider,
  type CmRoomPhase2HydrationPass,
} from "@/lib/community-messenger/room/cm-room-phase2-hydration-context";
import { notifyCmTradeDockLayoutChange } from "@/lib/community-messenger/room/cm-trade-dock-layout";
import { measureCmPassRenderCommit } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import {
  scheduleCmRoomPass1ToPass2,
  scheduleCmRoomPass2IdleExpand,
} from "@/lib/community-messenger/room/cm-room-pass-scheduler";
import {
  noteCmRoomPhase2ControllerDone,
  noteCmRoomPhase2ControllerStart,
  noteCmRoomPhase2HydratedFirstRender,
} from "@/lib/community-messenger/room/cm-room-phase2-entry-perf";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  getCmRoomSubtreeHydrationPass,
  isCmRoomSubtreeEntryPassAdvanced,
  markCmRoomSubtreeEntryPassAdvanced,
  noteCmRoomSubtreeAttach,
  setCmRoomSubtreeHydrationPass,
  bumpCmRoomHydrationPassFromPersisted,
  shouldBlockCmRoomStrictEffectReRun,
  shouldSkipCmRoomHydrationPassSchedule,
  shouldSkipCmRoomSubtreeSurfaceAttach,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";
import {
  noteCmRoomR5HydrationPassAtSeed,
  noteCmRoomR5Phase2BodyMount,
} from "@/lib/community-messenger/room/cm-room-r5-timeline-mount-instrumentation";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import {
  markMessengerRoomEntryScrollSettled,
  setMessengerRoomEntryHydrationPass,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import {
  hasMessengerRoomHydrationTimelineSeed,
  resolveMessengerRoomPhase2HydrationPassInitial,
} from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

function pushCmR8PerfEvent(roomId: string, event: string, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const t0 = entryTimingT0();
  const tMs = t0 > 0 && typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
  const row = {
    event,
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    t_ms: tMs,
    ...payload,
  };
  const bag = window.__cmPerfEvents ?? [];
  bag.push(row);
  window.__cmPerfEvents = bag;
  // eslint-disable-next-line no-console -- R8 phase2 body rows trace
  console.log("[cm-room-r8-phase2-body]", JSON.stringify(row));
}

function patchCmR9LayoutEffectCount(roomId: string, count: number): void {
  if (typeof window === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const bag = (window as Window & { __cmR9UpgradeStateByRoom?: Record<string, Record<string, unknown>> })
    .__cmR9UpgradeStateByRoom;
  if (!bag || !bag[id]) return;
  bag[id].layoutEffectCount = count;
}

type MessengerRoomPhase2Controller = ReturnType<typeof useMessengerRoomPhase2Controller>;

type CommunityMessengerRoomClientPhase2MainProps = {
  room: MessengerRoomPhase2Controller & {
    snapshot: NonNullable<MessengerRoomPhase2Controller["snapshot"]>;
  };
  keyboardOverlapSuppressed: boolean;
  /** 좁�? ?�면: visualViewport 기반 CSS 변?�·셸 ?�이 */
  narrowViewport: boolean;
  messengerKeyboardChromeOpen: boolean;
};

const CommunityMessengerRoomClientPhase2Main = memo(function CommunityMessengerRoomClientPhase2Main({
  room,
  keyboardOverlapSuppressed,
  narrowViewport,
  messengerKeyboardChromeOpen,
}: CommunityMessengerRoomClientPhase2MainProps) {
  useCmDevRenderTrace("MessengerShell");
  useCmStrictModeEffectProbe("MessengerShell");
  const phase2RenderPassStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  phase2RenderPassStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  const phase2PrevSigRef = useRef<{ msgLen: number; unread: number; readId: string } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** ??DOM ??붙�? ?�에�?vv 변??구독 ??�??�레?�에 ref 미�?착으�??�이 빠�???경우 방�? @see docs/community-messenger-mobile-room-viewport.md */
  const [chatShellMounted, setChatShellMounted] = useState(false);
  const roomIdStable = String(room.snapshot.room.id ?? "").trim();
  const [hydrationPass, setHydrationPass] = useState<CmRoomPhase2HydrationPass>(() => {
    const persisted = getCmRoomSubtreeHydrationPass(roomIdStable);
    const hasTimelineSeed = hasMessengerRoomHydrationTimelineSeed({
      roomMessagesLength: room.roomMessages?.length ?? 0,
      snapshotMessagesLength: room.snapshot.messages?.length ?? 0,
      snapshot: room.snapshot,
    });
    return resolveMessengerRoomPhase2HydrationPassInitial({ persistedPass: persisted, hasTimelineSeed });
  });
  const setMessengerShellRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setChatShellMounted(Boolean(node));
  }, []);

  useEffect(() => {
    if (!roomIdStable) return;
    setMessengerRoomEntryHydrationPass(roomIdStable, hydrationPass);
  }, [hydrationPass, roomIdStable]);

  useLayoutEffect(() => {
    const rid = roomIdStable;
    if (!rid) return;
    if (!shouldSkipCmRoomSubtreeSurfaceAttach(rid, "shell")) {
      noteCmRoomSubtreeAttach(rid, "shell");
    }
    const logPass1 = !shouldBlockCmRoomStrictEffectReRun(rid, "pass1_shell_milestone");
    if (logPass1) {
      useCmRoomOpeningOverlayStore.getState().noteHydrationComplete(rid);
      useCmRoomOpeningOverlayStore.getState().beginHandoff(rid);
      finalizeCmRoomEntryShellVisibleMs(rid, false, "phase2_main_shell");
      measureCmPassRenderCommit(1, phase2RenderPassStartRef.current);
      const renderMs = Math.round(performance.now() - phase2RenderPassStartRef.current);
      logCmRenderRoomEntry({
        component: "MessengerShell",
        render_ms: renderMs,
        commit_ms: renderMs,
        visible: true,
        deferred: false,
      });
    }
    const persisted = bumpCmRoomHydrationPassFromPersisted(rid, hydrationPass);
    if (persisted >= 3) {
      setHydrationPass(persisted as CmRoomPhase2HydrationPass);
      markMessengerRoomEntryScrollSettled(rid, "reentry_hydration_restored");
      return;
    }
    const hasTimelineSeed = hasMessengerRoomHydrationTimelineSeed({
      roomMessagesLength: room.roomMessages.length,
      snapshotMessagesLength: room.snapshot.messages?.length ?? 0,
      snapshot: room.snapshot,
    });
    if (hasTimelineSeed) {
      noteCmRoomR5HydrationPassAtSeed(
        rid,
        hydrationPass,
        Math.max(room.roomMessages.length, room.snapshot.messages?.length ?? 0)
      );
      if (hydrationPass < 3) {
        setHydrationPass(3);
        setCmRoomSubtreeHydrationPass(rid, 3);
      }
      return;
    }
    if (persisted >= 2) {
      setHydrationPass(persisted as CmRoomPhase2HydrationPass);
      return;
    }
    if (shouldSkipCmRoomHydrationPassSchedule(rid, 2)) return;
    return scheduleCmRoomPass1ToPass2(() => {
      setHydrationPass(2);
      setCmRoomSubtreeHydrationPass(rid, 2);
    });
  }, [hydrationPass, room.roomMessages.length, roomIdStable, room.snapshot.messages.length, room.snapshot]);

  useEffect(() => {
    if (hydrationPass >= 3) return;
    if (hydrationPass < 2) return;
    const rid = roomIdStable;
    if (!rid) return;
    const persisted = bumpCmRoomHydrationPassFromPersisted(rid, hydrationPass);
    if (persisted >= 3) {
      setHydrationPass(3);
      return;
    }
    if (shouldSkipCmRoomHydrationPassSchedule(rid, 3)) return;
    return scheduleCmRoomPass2IdleExpand(() => {
      setHydrationPass(3);
      setCmRoomSubtreeHydrationPass(rid, 3);
    }, 400);
  }, [hydrationPass, roomIdStable]);

  useLayoutEffect(() => {
    if (hydrationPass < 3) return;
    notifyCmTradeDockLayoutChange("phase2_trade_dock_mounted");
  }, [hydrationPass, roomIdStable]);

  const phase2EnterRecordedRef = useRef(false);
  const roomStateCommitRecordedRef = useRef(false);
  const messagesStateCommitRecordedRef = useRef(false);
  const participantsStateCommitRecordedRef = useRef(false);
  const profilesStateCommitRecordedRef = useRef(false);
  const displayRoomMessagesReadyRecordedRef = useRef(false);
  const fullMessageListRenderRecordedRef = useRef(false);
  const renderCountRef = useRef(0);
  const layoutEffectRunCountRef = useRef(0);
  const effectRunCountRef = useRef(0);
  renderCountRef.current += 1;
  recordRouteEntryMetric("messenger_room_entry", "phase2_rerender_count", Math.max(0, renderCountRef.current - 1));

  useEffect(() => {
    if (!cmRenderAnalysisEnabled()) return;
    const rid = String(room.snapshot.room.id ?? "").trim();
    if (!rid) return;
    resetCmRenderAnalysisSession(rid);
    ensureCmRenderAnalysisLayoutShiftObserver();
    return () => {
      disposeCmRenderAnalysisLayoutShiftObserver();
    };
  }, [room.snapshot.room.id]);

  useLayoutEffect(() => {
    if (!cmRenderAnalysisEnabled()) return;
    const msgLen = room.displayRoomMessages.length;
    const unread = room.snapshot.room.unreadCount ?? 0;
    const readId = room.snapshot.readReceipt?.lastReadMessageId?.trim() ?? "";
    const nextSig = { msgLen, unread, readId };
    const reason = deriveCmRoomRenderReason(phase2PrevSigRef.current, nextSig);
    phase2PrevSigRef.current = nextSig;
    const ms = Math.round(
      (typeof performance !== "undefined" ? performance.now() : 0) - phase2RenderPassStartRef.current
    );
    logCmRenderAnalysis({
      room_render_ms: ms,
      rerender_reason: reason,
      visible_message_count: msgLen,
    });
  }, [
    keyboardOverlapSuppressed,
    messengerKeyboardChromeOpen,
    room.displayRoomMessages.length,
    room.snapshot.room.unreadCount,
    room.snapshot.readReceipt?.lastReadMessageId,
    room.snapshot.room.id,
  ]);

  const view = useMemo(
    (): MessengerRoomPhase2ViewModel => ({
      ...room,
      snapshot: room.snapshot as CommunityMessengerRoomSnapshot,
    }),
    [
      room,
      room.snapshot,
      room.roomMessages,
      room.displayRoomMessages,
      room.chatVirtualizer,
      room.scrollMessengerToBottom,
      room.updateStickToBottomFromScroll,
      room.loading,
      room.timelineInitialLoadComplete,
      room.busy,
      room.message,
    ]
  );
  const tradeViewerRole = useMemo(
    () => messengerTradeViewerRoleFromContextMeta(view.snapshot.room.contextMeta ?? undefined),
    [view.snapshot.room.contextMeta]
  );
  const resolvedDeliveryMeta = useMemo(
    () => resolveCommunityMessengerDeliveryContextMeta(view.snapshot.room),
    [view.snapshot.room.contextMeta, view.snapshot.room.messengerDirectKey, view.snapshot.room.summary]
  );
  const deliveryViewerRole = useMemo(
    () => messengerDeliveryViewerRole(resolvedDeliveryMeta, view.snapshot.myRole),
    [resolvedDeliveryMeta, view.snapshot.myRole]
  );
  const storeOrderDeliveryRoomEnabled = view.showMessengerStoreOrderDock && view.storeOrderIdForDock.length > 0;
  /** 배달 kind 방 — summary/direct_key 포함, composer 입력 라인(pill)·footer 구분선. */
  const isDeliveryKindRoom = isCommunityMessengerStoreOrderDeliveryRoom(view.snapshot.room);
  const ownerSlideHost = useOwnerOrderChatSlideHost();
  const buyerSlideHost = useBuyerOrderChatSlideHost();
  const shellLayoutMode: ChatViewportShellLayoutMode =
    ownerSlideHost || buyerSlideHost ? "embedded" : narrowViewport ? "narrow" : "wide";
  const shellGeometryClass = useMemo(
    () =>
      resolveChatViewportShellClassNames({
        layoutMode: shellLayoutMode,
        platform: resolveChatViewportShellPlatform(),
      }),
    [shellLayoutMode]
  );

  useChatViewportShellInsets({
    enabled: chatShellMounted,
    shellRef: rootRef,
    layoutMode: shellLayoutMode,
    observeComposerHeight: true,
  });

  const storeOrderDeliveryIsOwnerApi =
    deliveryViewerRole === "seller" && view.storeIdForDock.length > 0;
  const headerView = useMemo(
    () => ({
      snapshot: view.snapshot,
      roomHeaderStatus: view.roomHeaderStatus,
      router: view.router,
      isGroupRoom: view.isGroupRoom,
      isPrivateGroupRoom: view.isPrivateGroupRoom,
      t: view.t,
      roomUnavailable: view.roomUnavailable,
      outgoingDialLocked: view.outgoingDialLocked,
      setActiveSheet: view.setActiveSheet,
      setRoomSearchQuery: view.setRoomSearchQuery,
      startManagedDirectCall: view.startManagedDirectCall,
    }),
    [
      view.snapshot,
      view.roomHeaderStatus,
      view.router,
      view.isGroupRoom,
      view.isPrivateGroupRoom,
      view.t,
      view.roomUnavailable,
      view.outgoingDialLocked,
      view.setActiveSheet,
      view.setRoomSearchQuery,
      view.startManagedDirectCall,
    ]
  );
  const composerView = useMemo<MessengerRoomPhase2ComposerViewModel>(
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
    patchCmR9LayoutEffectCount(String(room.snapshot.room.id ?? "").trim(), layoutEffectRunCountRef.current);
    if (!phase2EnterRecordedRef.current) {
      phase2EnterRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "phase2_enter_ms");
      noteCmRoomR5Phase2BodyMount(String(room.snapshot.room.id ?? "").trim());
    }
  }, [room.snapshot.room.id]);

  useLayoutEffect(() => {
    layoutEffectRunCountRef.current += 1;
    recordRouteEntryMetric(
      "messenger_room_entry",
      "phase2_use_layout_effect_count",
      layoutEffectRunCountRef.current
    );
    patchCmR9LayoutEffectCount(String(room.snapshot.room.id ?? "").trim(), layoutEffectRunCountRef.current);
    if (!roomStateCommitRecordedRef.current && room.snapshot?.room.id) {
      roomStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "json_parse_complete_ms");
      recordRouteEntryElapsedMetric("messenger_room_entry", "room_state_commit_ms");
    }
    if (!messagesStateCommitRecordedRef.current && room.roomMessages.length > 0) {
      messagesStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "messages_state_commit_ms");
    }
    if (!displayRoomMessagesReadyRecordedRef.current && room.roomMessages.length > 0) {
      displayRoomMessagesReadyRecordedRef.current = true;
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "message_list_ready_ms");
    }
    if (!participantsStateCommitRecordedRef.current && room.snapshot.members.length > 0) {
      participantsStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "participants_state_commit_ms");
    }
    if (!profilesStateCommitRecordedRef.current && room.roomMembersDisplay.length > 0) {
      profilesStateCommitRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "profiles_state_commit_ms");
    }
  }, [room.displayRoomMessages.length, room.roomMembersDisplay.length, room.roomMessages.length, room.snapshot]);

  const virtualizerUpgradeScheduledLoggedRef = useRef(false);
  useEffect(() => {
    virtualizerUpgradeScheduledLoggedRef.current = false;
  }, [room.snapshot.room.id]);
  useEffect(() => {
    if (!room.timelineHeavyLive) return;
    const roomId = String(room.snapshot.room.id ?? "").trim();
    if (!roomId) return;
    if (virtualizerUpgradeScheduledLoggedRef.current) return;
    virtualizerUpgradeScheduledLoggedRef.current = true;
    const scheduledMs =
      (() => {
        const t0 = entryTimingT0();
        return t0 > 0 && typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
      })();
    const priorScheduledMs = (
      window as Window & {
        __cmR9UpgradeStateByRoom?: Record<string, { virtualizerUpgradeScheduledMs?: number | null }>;
      }
    ).__cmR9UpgradeStateByRoom?.[roomId]?.virtualizerUpgradeScheduledMs;
    pushCmR8PerfEvent(roomId, "virtualizer_upgrade_scheduled", {
      virtualizer_upgrade_scheduled_ms: priorScheduledMs ?? scheduledMs,
      rows_before_upgrade_count: room.displayRoomMessages.length,
      upgrade_source: "phase2_body_heavy_live",
    });
  }, [room.displayRoomMessages.length, room.snapshot.room.id, room.timelineHeavyLive]);

  useEffect(() => {
    pushCmR8PerfEvent(room.snapshot.room.id, "phase2_body_rows_count", {
      bootstrap_message_count: room.snapshot.messages.length,
      phase1_seed_message_count: room.roomMessages.length,
      display_message_count: room.displayRoomMessages.length,
    });
  }, [room.displayRoomMessages.length, room.roomMessages.length, room.snapshot.messages.length, room.snapshot.room.id]);

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
    tryEmitCmRoomEntryV2Log(String(room.snapshot.room.id ?? "").trim());
  }, [room.displayRoomMessages.length, room.photoMessageCount, room.snapshot.messages.length, room.snapshot.room.id]);

  return (
    <MessengerRoomMobileViewportProvider
      value={{ keyboardOverlapSuppressed, messengerKeyboardChromeOpen }}
    >
      <MessengerRoomPhase2ViewProvider value={view}>
        <StoreOrderDeliveryRoomProvider
          storeOrderId={view.storeOrderIdForDock}
          storeId={view.storeIdForDock}
          isOwnerApi={storeOrderDeliveryIsOwnerApi}
          enabled={storeOrderDeliveryRoomEnabled}
        >
        <CmRoomPhase2HydrationProvider pass={hydrationPass}>
        <div
          ref={setMessengerShellRef}
          data-messenger-shell
          data-cm-room
          data-cm-room-hydration-pass={hydrationPass}
          data-trade-viewer-role={tradeViewerRole ?? undefined}
          data-delivery-viewer-role={deliveryViewerRole ?? undefined}
          className={`${shellGeometryClass} flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]${isDeliveryKindRoom ? " delivery-ui" : ""}`}
        >
          <MessengerRoomPhase2HeaderProvider value={headerView}>
            <CommunityMessengerRoomPhase2Header />
            <CommunityMessengerRoomPhase2PeerNotice />
          </MessengerRoomPhase2HeaderProvider>
          <div
            className={hydrationPass >= 2 ? "contents" : "hidden min-h-0 flex-1"}
            aria-hidden={hydrationPass < 2}
            data-cm-room-viewport-persistent=""
          >
            <CommunityMessengerRoomPhase2MessageTimeline />
            <CommunityMessengerRoomPhase2MessageOverlays />
          </div>
          {hydrationPass < 2 ? (
            <div
              className="min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]"
              aria-hidden
              data-cm-room-viewport-placeholder
            />
          ) : null}
          <CommunityMessengerRoomPhase2AttachmentsAndTrade />
          <MessengerRoomPhase2ComposerProvider value={composerView}>
            <CommunityMessengerRoomPhase2Composer composerEntryVisible composerSurfaceMode="phase2" />
          </MessengerRoomPhase2ComposerProvider>
          <div className={hydrationPass >= 3 ? "contents" : "hidden"} aria-hidden={hydrationPass < 3} data-cm-room-pass3-persistent="">
            <CommunityMessengerRoomPhase2RoomSheets />
            <CommunityMessengerRoomPhase2MemberActionModal />
            <MessengerRoomPhase2CallProvider value={callView}>
              <CommunityMessengerRoomPhase2CallLayer />
            </MessengerRoomPhase2CallProvider>
          </div>
        </div>
        </CmRoomPhase2HydrationProvider>
        </StoreOrderDeliveryRoomProvider>
      </MessengerRoomPhase2ViewProvider>
    </MessengerRoomMobileViewportProvider>
  );
});

function CommunityMessengerRoomClientPhase2Body({
  keyboardOverlapSuppressed,
  messengerKeyboardChromeOpen,
}: {
  keyboardOverlapSuppressed: boolean;
  messengerKeyboardChromeOpen: boolean;
}) {
  noteCmRoomPhase2HydratedFirstRender();
  return (
    <CommunityMessengerRoomClientPhase2Hydrated
      keyboardOverlapSuppressed={keyboardOverlapSuppressed}
      messengerKeyboardChromeOpen={messengerKeyboardChromeOpen}
    />
  );
}

const CommunityMessengerRoomClientPhase2Hydrated = memo(function CommunityMessengerRoomClientPhase2Hydrated({
  keyboardOverlapSuppressed,
  messengerKeyboardChromeOpen,
}: {
  keyboardOverlapSuppressed: boolean;
  messengerKeyboardChromeOpen: boolean;
}) {
  noteCmRoomPhase2ControllerStart();
  const room = useMessengerRoomPhase2Controller();
  useLayoutEffect(() => {
    noteCmRoomPhase2ControllerDone();
  }, [room.snapshot?.room.id]);
  const searchParams = useMessengerRoomUrlSearchParams();
  useCommunityMessengerRoomTypingRuntime({
    roomId: room.snapshot?.room.id ?? null,
    viewerUserId: room.snapshot?.viewerUserId ?? null,
    peerUserId: room.snapshot?.room.peerUserId ?? null,
  });
  const isNarrowViewport = useMatchMaxWidthMd();
  const requestAnimatedBack = useMessengerRoomAnimatedBack();

  if (!room.snapshot) {
    if (room.loading) {
      return <CommunityMessengerRoomShellSkeleton />;
    }
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="sam-text-body-lg font-semibold text-ui-fg">{room.t("cm_ui_cannot_find_chat_room")}</p>
        <button
          type="button"
          onClick={() => {
            if (requestAnimatedBack) {
              requestAnimatedBack();
              return;
            }
            const plan = resolveMessengerRoomBackNavigation({
              roomId: room.snapshot?.room.id ?? "",
              searchParams,
            });
            runMessengerRoomBackNavigation(room.router, plan);
          }}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 sam-text-body font-semibold text-ui-surface"
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
      narrowViewport={isNarrowViewport}
      messengerKeyboardChromeOpen={messengerKeyboardChromeOpen}
    />
  );
});
export default CommunityMessengerRoomClientPhase2Body;
