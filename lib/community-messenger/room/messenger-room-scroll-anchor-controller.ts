"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { CM_ROOM_CHROME_HEIGHT_SYNC_EVENT } from "@/lib/ui/cm-room-visible-viewport-contract";
import { createChatThreadScrollEngine, type ChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";
import type { ChatThreadScrollRestoreSnapshot, ChatThreadVirtualizer } from "@/lib/chat-thread-scroll/types";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import {
  consumeMessengerRoomEntryIntent,
  resolveMessengerRoomEntryScrollPlan,
  type MessengerRoomEntryIntent,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { resolveMessengerRoomEntryScrollPaintReady } from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";
import {
  markMessengerRoomEntryScrollSettled,
  markMessengerRoomScrollOwnerRun,
  resetMessengerRoomEntryScrollOwner,
  type CmScrollOwnerReason,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import {
  clearMessengerRoomScrollPosition,
  consumeMessengerRoomScrollPosition,
  peekMessengerRoomScrollPosition,
  resolveScrollTopForAnchorMessage,
  saveMessengerRoomScrollPosition,
  snapshotScrollFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-position-store";
import { syncMessengerRoomStickToBottomFromViewport } from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { messengerRoomTracksScrollPosition } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import {
  beginCmScrollAuthoritySession,
  noteCmScrollAuthorityEvent,
} from "@/lib/community-messenger/room/cm-room-scroll-authority-instrumentation";

export type MessengerRoomScrollAnchorRequest = {
  reason: CmScrollOwnerReason;
  force?: boolean;
  retryCount?: number;
};

type VirtualizerLike = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex" | "getTotalSize">;

type ScrollAnchorControllerOpts = {
  roomId: string;
  activeSheet:
    | null
    | "attach"
    | "attach-confirm"
    | "menu"
    | "members"
    | "info"
    | "search"
    | "media"
    | "files"
    | "links"
    | "stickers"
    | "emoji";
  stickToBottomRef: MutableRefObject<boolean>;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  roomMessages: Array<{ id?: string; isMine?: boolean; clientMessageId?: string | null; pending?: boolean }>;
  virtualizer?: VirtualizerLike;
  messageCount: number;
  deferEntryScrollToDeliveryDirectTimeline?: boolean;
  timelineViewportMounted?: boolean;
  timelineHeavyReady?: boolean;
  loadingOlderMessages?: boolean;
  /** bootstrap initial fetch 완료 — 진입 scroll 1회 게이트 */
  timelineInitialLoadComplete?: boolean;
  unreadCount?: number;
  lastReadMessageId?: string | null;
};

function isExplicitScrollReason(reason: CmScrollOwnerReason): boolean {
  return reason === "own_message_append" || reason === "explicit";
}

function isEntryScrollReason(reason: CmScrollOwnerReason): boolean {
  return (
    reason === "room_entry_initial" ||
    reason === "initial_load" ||
    reason === "push_entry_initial_load" ||
    reason === "room_entry_restore" ||
    reason === "timeline_delivery_direct_paint" ||
    reason === "schedule_after_rows_painted"
  );
}

function isLayoutPreserveReason(reason: CmScrollOwnerReason): boolean {
  return (
    reason === "viewport_resize_restore" ||
    reason === "viewport_resize_keep_bottom" ||
    reason === "keyboard_resize_keep_bottom" ||
    reason === "composer_resize_keep_bottom" ||
    reason === "virtualizer_scroll_anchor" ||
    reason === "store_order_chrome_keyboard_compact" ||
    reason === "chrome_resize_preserve" ||
    /** legacy names — absorbed as layout preserve, never re-entry */
    reason === "entry_tail_settle" ||
    reason === "push_entry_tail_settle"
  );
}

function mapInitialSource(reason: CmScrollOwnerReason, forceBottom: boolean, hasAnchor: boolean): string {
  if (reason === "room_entry_restore" && hasAnchor && !forceBottom) return "persisted_restore";
  if (reason === "room_entry_restore" && hasAnchor) return "initial_last_read";
  if (forceBottom || reason === "initial_load" || reason === "push_entry_initial_load") {
    return "initial_latest";
  }
  return String(reason);
}

/**
 * Single scroll authority for CM rooms (Telegram/Kakao contract).
 * - Initial anchor: room generation 당 1회 — viewport attach sync flush + layoutEffect backup
 * - Resize/keyboard/chrome: one notifyLayoutResize transaction (stick pin / preserve anchor)
 * - scrollTop 조작은 ChatThreadScrollEngine 만 — 플랫폼 adapter는 이벤트만 전달
 */
export function useMessengerRoomScrollAnchorController(opts: ScrollAnchorControllerOpts): {
  scrollMessengerToBottom: (request?: { reason?: CmScrollOwnerReason; force?: boolean }) => void;
  updateStickToBottomFromScroll: () => void;
  persistScrollPosition: () => void;
  enqueueScrollAnchor: (request: MessengerRoomScrollAnchorRequest) => void;
  /** Timeline ref attach 시 paint 전 동기 1회 — setState mount gate cross-commit 금지 */
  flushInitialEntryAnchor: () => boolean;
} {
  const {
    roomId,
    activeSheet,
    stickToBottomRef,
    messagesViewportRef,
    roomMessages,
    virtualizer,
    messageCount,
    deferEntryScrollToDeliveryDirectTimeline = false,
    timelineViewportMounted = false,
    timelineHeavyReady = false,
    loadingOlderMessages = false,
    timelineInitialLoadComplete = false,
    unreadCount = 0,
    lastReadMessageId = null,
  } = opts;

  void opts.messageEndRef;

  const engineRef = useRef<ChatThreadScrollEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createChatThreadScrollEngine({
      messageRowSelector: "[data-cm-timeline-message-row]",
      resolveEntryPaintReady: (ctx) =>
        resolveMessengerRoomEntryScrollPaintReady({
          viewport: ctx.viewport,
          virtualizer: ctx.virtualizer ?? undefined,
          messageCount: ctx.messageCount,
        }),
    });
  }
  const engine = engineRef.current;

  const entryIntentRef = useRef<MessengerRoomEntryIntent>("default");
  const entryScrollScheduledRef = useRef(false);
  const hasAppliedInitialAnchorRef = useRef(false);
  const roomGenerationRef = useRef(0);
  const prevTailMessageIdRef = useRef<string | null>(null);
  const prevTailClientMessageIdRef = useRef<string | null>(null);
  const pendingAnchorMessageIdRef = useRef<string | null>(null);

  const toVirtualizer = useCallback((): ChatThreadVirtualizer | null => {
    if (!virtualizer) return null;
    return {
      scrollToIndex: virtualizer.scrollToIndex?.bind(virtualizer),
      getTotalSize: virtualizer.getTotalSize?.bind(virtualizer),
    };
  }, [virtualizer]);

  const buildCtx = useCallback(
    () => ({
      viewport: messagesViewportRef.current,
      messageCount,
      virtualizer: toVirtualizer(),
    }),
    [messageCount, messagesViewportRef, toVirtualizer]
  );

  const persistScrollPosition = useCallback(() => {
    const rid = roomId.trim();
    if (!rid) return;
    const snap = snapshotScrollFromViewport(messagesViewportRef.current, stickToBottomRef.current);
    if (!snap) return;
    saveMessengerRoomScrollPosition(rid, snap);
  }, [roomId, messagesViewportRef, stickToBottomRef]);

  const markCmScrollRun = useCallback(
    (reason: CmScrollOwnerReason, source?: string) => {
      const rid = roomId.trim();
      const vp = messagesViewportRef.current;
      if (!rid) return;
      markMessengerRoomScrollOwnerRun(rid, reason, {
        scrollTop: vp?.scrollTop,
        scrollHeight: vp?.scrollHeight,
        clientHeight: vp?.clientHeight,
      });
      noteCmScrollAuthorityEvent("scroll_command", {
        roomId: rid,
        source: source ?? String(reason),
        scrollTop: vp?.scrollTop,
        scrollHeight: vp?.scrollHeight,
        clientHeight: vp?.clientHeight,
        roomGeneration: roomGenerationRef.current,
      });
    },
    [messagesViewportRef, roomId]
  );

  const completeEntryPhase = useCallback(
    (reason: CmScrollOwnerReason, source: string) => {
      const rid = roomId.trim();
      if (!rid || engine.getPhase() !== "settled") return;
      hasAppliedInitialAnchorRef.current = true;
      markMessengerRoomEntryScrollSettled(rid, reason);
      markCmScrollRun(reason, source);
      noteCmScrollAuthorityEvent("initial_anchor_applied", {
        roomId: rid,
        source,
        roomGeneration: roomGenerationRef.current,
        scrollTop: messagesViewportRef.current?.scrollTop,
        scrollHeight: messagesViewportRef.current?.scrollHeight,
        clientHeight: messagesViewportRef.current?.clientHeight,
      });
      if (messengerRoomTracksScrollPosition() && stickToBottomRef.current) {
        useMessengerRoomReaderStateStore.getState().setScrollPosition(rid, "at-bottom");
      }
    },
    [engine, markCmScrollRun, messagesViewportRef, roomId, stickToBottomRef]
  );

  const tryCompleteEntry = useCallback(
    (reason: CmScrollOwnerReason, source: string) => {
      if (hasAppliedInitialAnchorRef.current && engine.isSettled()) return true;
      const ok = engine.tryCompleteEntry(buildCtx());
      if (ok) {
        stickToBottomRef.current = engine.readStickToBottom();
        completeEntryPhase(reason, source);
        return true;
      }
      return false;
    },
    [buildCtx, completeEntryPhase, engine, stickToBottomRef]
  );

  const notifyEntryFromPlan = useCallback(
    (
      reason: CmScrollOwnerReason,
      forceBottom: boolean,
      planAnchorMessageId?: string | null
    ) => {
      const rid = roomId.trim();
      const vp = messagesViewportRef.current;
      let restoreSnapshot: ChatThreadScrollRestoreSnapshot | null = null;

      if (reason === "room_entry_restore" && rid) {
        const persisted = consumeMessengerRoomScrollPosition(rid);
        if (persisted) {
          if (persisted.stickToBottom) {
            engine.notifyEntry({ forceBottom: true });
            stickToBottomRef.current = true;
            pendingAnchorMessageIdRef.current = null;
            return;
          }
          let scrollTop = persisted.scrollTop;
          if (persisted.firstVisibleMessageId && vp) {
            const anchorTop = resolveScrollTopForAnchorMessage(vp, persisted.firstVisibleMessageId);
            if (anchorTop != null) scrollTop = anchorTop;
          }
          restoreSnapshot = {
            stickToBottom: false,
            scrollTop,
            firstVisibleMessageId: persisted.firstVisibleMessageId,
          };
          stickToBottomRef.current = false;
          pendingAnchorMessageIdRef.current = persisted.firstVisibleMessageId;
          engine.notifyEntry({ forceBottom: false, restoreSnapshot });
          return;
        }

        const anchorId = planAnchorMessageId?.trim() || "";
        if (anchorId && vp) {
          const anchorTop = resolveScrollTopForAnchorMessage(vp, anchorId);
          if (anchorTop != null) {
            restoreSnapshot = {
              stickToBottom: false,
              scrollTop: anchorTop,
              firstVisibleMessageId: anchorId,
            };
            stickToBottomRef.current = false;
            pendingAnchorMessageIdRef.current = anchorId;
            engine.notifyEntry({ forceBottom: false, restoreSnapshot });
            return;
          }
          /** DOM 아직 없으면 index 기반 복원은 settle 시 bottom 보다 lastRead 우선 — 메시지 미존재면 latest */
        }
      }

      pendingAnchorMessageIdRef.current = planAnchorMessageId?.trim() || null;
      engine.notifyEntry({ forceBottom: forceBottom && !restoreSnapshot, restoreSnapshot });
      if (forceBottom) stickToBottomRef.current = true;
    },
    [engine, messagesViewportRef, roomId, stickToBottomRef]
  );

  const applyLayoutPreserve = useCallback(
    (reason: CmScrollOwnerReason) => {
      const vp = messagesViewportRef.current;
      if (loadingOlderMessages) {
        noteCmScrollAuthorityEvent("scroll_command", {
          roomId,
          source: "resize_guard_skip",
          detail: { reason, guard: "loadingOlderMessages" },
          scrollTop: vp?.scrollTop,
          scrollHeight: vp?.scrollHeight,
          clientHeight: vp?.clientHeight,
          roomGeneration: roomGenerationRef.current,
        });
        return;
      }
      if (!engine.isSettled() || !hasAppliedInitialAnchorRef.current) {
        noteCmScrollAuthorityEvent("scroll_command", {
          roomId,
          source: "resize_guard_skip",
          detail: {
            reason,
            guard: "not_settled_or_no_initial",
            phase: engine.getPhase(),
            hasAppliedInitialAnchor: hasAppliedInitialAnchorRef.current,
          },
          scrollTop: vp?.scrollTop,
          clientHeight: vp?.clientHeight,
          roomGeneration: roomGenerationRef.current,
        });
        if (engine.getPhase() === "entryPendingLayout") {
          tryCompleteEntry("initial_load", "initial_latest");
        }
        return;
      }

      /** Product stick ↔ engine stick 동기화 — desync 시 preserve no-op로 last bubble 숨김 방지 */
      const stick = stickToBottomRef.current;
      engine.syncStickToBottom(stick);

      noteCmScrollAuthorityEvent("scroll_command", {
        roomId,
        source: "resize_signal",
        detail: {
          reason,
          stick,
          phase: engine.getPhase(),
          bottomDistance:
            vp != null ? Math.max(0, vp.scrollHeight - vp.scrollTop - vp.clientHeight) : null,
        },
        scrollTop: vp?.scrollTop,
        scrollHeight: vp?.scrollHeight,
        clientHeight: vp?.clientHeight,
        roomGeneration: roomGenerationRef.current,
      });

      const wrote = engine.notifyLayoutResize(buildCtx());
      if (!stick) {
        syncMessengerRoomStickToBottomFromViewport({
          viewport: messagesViewportRef.current,
          stickToBottomRef,
          roomId,
          activeSheet,
        });
        persistScrollPosition();
        if (wrote) markCmScrollRun(reason, "chrome_resize_preserve");
        return;
      }
      stickToBottomRef.current = true;
      if (wrote) markCmScrollRun(reason, "keyboard_resize_follow");
    },
    [
      activeSheet,
      buildCtx,
      engine,
      loadingOlderMessages,
      markCmScrollRun,
      messagesViewportRef,
      persistScrollPosition,
      roomId,
      stickToBottomRef,
      tryCompleteEntry,
    ]
  );

  const scrollMessengerToBottom = useCallback(
    (req?: { reason?: CmScrollOwnerReason; force?: boolean }) => {
      const reason = req?.reason ?? "explicit";
      const force = req?.force === true || isExplicitScrollReason(reason);

      /** legacy tail settle / after-rows → layout preserve only (never re-entry) */
      if (isLayoutPreserveReason(reason) && !isEntryScrollReason(reason)) {
        applyLayoutPreserve(reason);
        return;
      }

      if (isEntryScrollReason(reason)) {
        if (hasAppliedInitialAnchorRef.current) {
          applyLayoutPreserve("chrome_resize_preserve");
          return;
        }
        engine.notifyMessagesReady(messageCount > 0);
        engine.notifyLayoutCommitted();
        const source = mapInitialSource(reason, force, Boolean(pendingAnchorMessageIdRef.current));
        tryCompleteEntry(reason, source);
        return;
      }

      if (force) {
        engine.scrollToBottomExplicit(buildCtx());
        stickToBottomRef.current = true;
        markCmScrollRun(reason, reason === "own_message_append" ? "self_send_follow" : "explicit");
        return;
      }

      engine.notifyAppend(buildCtx());
      if (engine.readStickToBottom()) {
        markCmScrollRun(reason, "realtime_follow");
      }
    },
    [
      applyLayoutPreserve,
      buildCtx,
      engine,
      markCmScrollRun,
      messageCount,
      stickToBottomRef,
      tryCompleteEntry,
    ]
  );

  const enqueueScrollAnchor = useCallback(
    (request: MessengerRoomScrollAnchorRequest) => {
      if (request.reason === "prepend_older_preserve_position") return;
      scrollMessengerToBottom({ reason: request.reason, force: request.force });
    },
    [scrollMessengerToBottom]
  );

  const updateStickToBottomFromScroll = useCallback(() => {
    engine.notifyUserScroll(buildCtx());
    stickToBottomRef.current = engine.readStickToBottom();
    syncMessengerRoomStickToBottomFromViewport({
      viewport: messagesViewportRef.current,
      stickToBottomRef,
      roomId,
      activeSheet,
      emitScrollLogs: true,
    });
    persistScrollPosition();
    noteCmScrollAuthorityEvent("scroll_command", {
      roomId,
      source: "user_scroll",
      scrollTop: messagesViewportRef.current?.scrollTop,
      roomGeneration: roomGenerationRef.current,
    });
  }, [activeSheet, buildCtx, engine, messagesViewportRef, persistScrollPosition, roomId, stickToBottomRef]);

  useLayoutEffect(() => {
    const rid = roomId.trim();
    if (rid) resetMessengerRoomEntryScrollOwner(rid);
    engine.reset();
    entryScrollScheduledRef.current = false;
    hasAppliedInitialAnchorRef.current = false;
    pendingAnchorMessageIdRef.current = null;
    prevTailMessageIdRef.current = null;
    prevTailClientMessageIdRef.current = null;
    roomGenerationRef.current += 1;
    if (rid) beginCmScrollAuthoritySession(rid, roomGenerationRef.current);

    const intent =
      typeof window !== "undefined"
        ? consumeMessengerRoomEntryIntent(rid, window.location.search)
        : "default";
    entryIntentRef.current = intent;
    if (intent === "push" && rid) {
      clearMessengerRoomScrollPosition(rid);
      stickToBottomRef.current = true;
    } else {
      stickToBottomRef.current = peekMessengerRoomScrollPosition(rid)?.stickToBottom ?? true;
    }
  }, [engine, roomId, stickToBottomRef]);

  /** Initial anchor — room generation 당 1회. viewport attach sync + layoutEffect backup. */
  const runInitialAnchorIfReady = useCallback(
    (flushSource: string): boolean => {
      if (deferEntryScrollToDeliveryDirectTimeline || roomMessages.length <= 0) return false;
      if (!messagesViewportRef.current) return false;
      if (!timelineInitialLoadComplete) return false;
      /** heavy 없이도 direct rows paint 가능 — heavy는 virtualizer 보조만 */
      if (!timelineHeavyReady && messageCount <= 0) return false;
      if (entryScrollScheduledRef.current || hasAppliedInitialAnchorRef.current) return false;

      const rid = roomId.trim();
      const hasPersisted = Boolean(peekMessengerRoomScrollPosition(rid));
      const plan = resolveMessengerRoomEntryScrollPlan({
        intent: entryIntentRef.current,
        hasPersisted,
        unreadCount,
        lastReadMessageId,
      });
      if (plan.clearPersist && rid) clearMessengerRoomScrollPosition(rid);
      if (plan.forceBottom) stickToBottomRef.current = true;

      entryScrollScheduledRef.current = true;
      notifyEntryFromPlan(plan.reason, plan.forceBottom, plan.anchorMessageId ?? null);
      engine.notifyMessagesReady(true);
      engine.notifyLayoutCommitted();
      const source = mapInitialSource(
        plan.reason,
        plan.forceBottom,
        Boolean(plan.anchorMessageId || pendingAnchorMessageIdRef.current)
      );
      noteCmScrollAuthorityEvent("scroll_command", {
        roomId: rid,
        source: "initial_anchor_request",
        detail: { flushSource, planReason: plan.reason, forceBottom: plan.forceBottom },
        scrollTop: messagesViewportRef.current?.scrollTop,
        clientHeight: messagesViewportRef.current?.clientHeight,
        roomGeneration: roomGenerationRef.current,
      });
      const applied = tryCompleteEntry(plan.reason, source);
      if (!applied) {
        /** viewport 높이 미확정 — 다음 RO/layout에서 1회만 완료 (중첩 rAF settle 금지) */
        entryScrollScheduledRef.current = true;
      }
      return applied;
    },
    [
      deferEntryScrollToDeliveryDirectTimeline,
      engine,
      lastReadMessageId,
      messageCount,
      messagesViewportRef,
      notifyEntryFromPlan,
      roomId,
      roomMessages.length,
      stickToBottomRef,
      timelineHeavyReady,
      timelineInitialLoadComplete,
      tryCompleteEntry,
      unreadCount,
    ]
  );

  const flushInitialEntryAnchor = useCallback((): boolean => {
    return runInitialAnchorIfReady("viewport_attach_sync");
  }, [runInitialAnchorIfReady]);

  useLayoutEffect(() => {
    /** setState mounted gate 대신 ref 존재 + 상태 게이트 — sync flush 실패 시 paint 전 backup */
    if (!timelineViewportMounted && !messagesViewportRef.current) return;
    runInitialAnchorIfReady("layout_effect_backup");
  }, [messagesViewportRef, runInitialAnchorIfReady, timelineViewportMounted]);

  useEffect(() => {
    engine.notifyPrependInFlight(loadingOlderMessages);
  }, [engine, loadingOlderMessages]);

  /** Chrome height — layout preserve only (no entry_tail_settle) */
  useEffect(() => {
    const onChromeHeightSynced = (ev: Event) => {
      const rid = roomId.trim();
      if (!rid) return;
      const detail = (ev as CustomEvent<{ roomId?: string }>).detail;
      if (detail?.roomId && detail.roomId !== rid) return;
      if (engine.getPhase() === "entryPendingLayout" && !hasAppliedInitialAnchorRef.current) {
        tryCompleteEntry("initial_load", "initial_latest");
        return;
      }
      applyLayoutPreserve("composer_resize_keep_bottom");
    };

    window.addEventListener(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, onChromeHeightSynced);
    return () => window.removeEventListener(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, onChromeHeightSynced);
  }, [applyLayoutPreserve, engine, roomId, tryCompleteEntry]);

  useEffect(() => {
    const last = roomMessages[roomMessages.length - 1];
    const decision = resolveMessengerRoomMessagesAutoScroll({
      previousTailMessageId: prevTailMessageIdRef.current,
      currentTailMessageId: last?.id ?? null,
      currentTailIsMine: Boolean(last?.isMine),
      previousTailClientMessageId: prevTailClientMessageIdRef.current,
      currentTailClientMessageId: last?.clientMessageId ?? null,
    });
    if (decision.scroll) {
      if (decision.reason === "own_message_append") {
        scrollMessengerToBottom({ reason: "own_message_append", force: true });
      } else if (engine.readStickToBottom()) {
        scrollMessengerToBottom({ reason: "peer_message_near_bottom" });
      }
    }
    if (last?.id) {
      prevTailMessageIdRef.current = last.id;
      prevTailClientMessageIdRef.current = last.clientMessageId ?? null;
    }
  }, [engine, roomMessages, scrollMessengerToBottom]);

  useLayoutEffect(() => {
    /** Timeline DOM 부착 후에만 구독 — mount 전 early-return 후 재구독 누락 금지 */
    if (!timelineViewportMounted) return;
    const el = messagesViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const onViewportResize = () => {
      if (loadingOlderMessages) return;
      if (engine.getPhase() === "entryPendingLayout" && !hasAppliedInitialAnchorRef.current) {
        tryCompleteEntry("initial_load", "initial_latest");
        return;
      }
      applyLayoutPreserve("viewport_resize_keep_bottom");
    };

    const roTimeline = new ResizeObserver(onViewportResize);
    roTimeline.observe(el);

    const onLayoutViewport = () => onViewportResize();
    window.addEventListener("resize", onLayoutViewport);
    window.addEventListener("orientationchange", onLayoutViewport);

    /** Platform adapter input — scroll write 는 applyLayoutPreserve → engine 만 */
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const onVv = () => {
      if (engine.getPhase() === "entryPendingLayout") return;
      applyLayoutPreserve("keyboard_resize_keep_bottom");
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);

    return () => {
      roTimeline.disconnect();
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onLayoutViewport);
      window.removeEventListener("orientationchange", onLayoutViewport);
    };
  }, [
    applyLayoutPreserve,
    engine,
    loadingOlderMessages,
    messagesViewportRef,
    timelineViewportMounted,
    tryCompleteEntry,
  ]);

  useEffect(() => {
    return () => {
      persistScrollPosition();
    };
  }, [persistScrollPosition]);

  return {
    scrollMessengerToBottom,
    updateStickToBottomFromScroll,
    persistScrollPosition,
    enqueueScrollAnchor,
    flushInitialEntryAnchor,
  };
}
