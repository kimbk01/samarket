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
import { resolveFirstUnreadMessageId } from "@/lib/community-messenger/room/messenger-room-first-unread";
import { captureMessengerRoomEntryUnread } from "@/lib/community-messenger/room/messenger-room-entry-unread-snapshot";
import {
  clearMessengerRoomScrollPosition,
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
 * - Initial anchor: room generation 당 1회, useLayoutEffect (paint 전)
 * - Resize/keyboard/chrome: settled 이후 preserve/follow 만 — 재 entry·tail settle 금지
 * - scrollTop 조작은 ChatThreadScrollEngine 만
 */
export function useMessengerRoomScrollAnchorController(opts: ScrollAnchorControllerOpts): {
  scrollMessengerToBottom: (request?: { reason?: CmScrollOwnerReason; force?: boolean }) => void;
  updateStickToBottomFromScroll: () => void;
  persistScrollPosition: () => void;
  enqueueScrollAnchor: (request: MessengerRoomScrollAnchorRequest) => void;
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
  /** seeded/silent backfill 감지용 — pagination(loadOlderMessages)과는 별개 신호 */
  const prevHeadMessageIdRef = useRef<string | null>(null);
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
      const vp = messagesViewportRef.current;
      let restoreSnapshot: ChatThreadScrollRestoreSnapshot | null = null;

      /** Unread Enter only — persist scroll restore is not an Enter policy. */
      if (reason === "room_entry_restore") {
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
        }
      }

      pendingAnchorMessageIdRef.current = planAnchorMessageId?.trim() || null;
      engine.notifyEntry({ forceBottom: forceBottom && !restoreSnapshot, restoreSnapshot });
      if (forceBottom) stickToBottomRef.current = true;
    },
    [engine, messagesViewportRef, stickToBottomRef]
  );

  /**
   * Single layout/keyboard correction writer.
   * Does **not** re-decide Enter policy or flip stick from viewport noise —
   * only preserves stick (bottom) vs non-stick (distance) set at Enter / user scroll / send.
   */
  const applyLayoutPreserve = useCallback(
    (reason: CmScrollOwnerReason) => {
      if (loadingOlderMessages) return;

      engine.notifyMessagesReady(messageCount > 0);
      engine.notifyLayoutCommitted();
      const ok = engine.correctLayoutPreserve(buildCtx());
      stickToBottomRef.current = engine.readStickToBottom();
      if (ok && engine.isSettled() && !hasAppliedInitialAnchorRef.current) {
        completeEntryPhase(
          reason === "keyboard_resize_keep_bottom" ? "initial_load" : reason,
          "layout_correct_settle"
        );
      }
      markCmScrollRun(
        reason,
        stickToBottomRef.current ? "keyboard_preserve" : "chrome_resize_preserve"
      );
      if (!stickToBottomRef.current) persistScrollPosition();
    },
    [
      buildCtx,
      completeEntryPhase,
      engine,
      loadingOlderMessages,
      markCmScrollRun,
      messageCount,
      persistScrollPosition,
      stickToBottomRef,
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
    prevHeadMessageIdRef.current = null;
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

  /** Initial anchor — room generation 당 1회, layoutEffect(paint 전). composer/fingerprint 재실행 금지. */
  useLayoutEffect(() => {
    if (deferEntryScrollToDeliveryDirectTimeline || roomMessages.length <= 0) return;
    if (!timelineViewportMounted) return;
    if (!timelineInitialLoadComplete) return;
    /** heavy 없이도 direct rows paint 가능 — heavy는 virtualizer 보조만 */
    if (!timelineHeavyReady && messageCount <= 0) return;
    if (entryScrollScheduledRef.current || hasAppliedInitialAnchorRef.current) return;

    const rid = roomId.trim();
    const hasPersisted = Boolean(peekMessengerRoomScrollPosition(rid));
    const firstUnreadMessageId = resolveFirstUnreadMessageId({
      messages: roomMessages,
      lastReadMessageId,
    });
    if (rid && unreadCount > 0) {
      captureMessengerRoomEntryUnread({
        roomId: rid,
        unreadCount,
        firstUnreadMessageId,
      });
    }
    const lastReadTrim =
      typeof lastReadMessageId === "string" ? lastReadMessageId.trim() : "";
    const lastReadIdx = lastReadTrim
      ? roomMessages.findIndex((m) => m.id === lastReadTrim)
      : -1;
    /** lastRead in window but no unread after → treat as caught up (latest bottom) */
    const effectiveUnread =
      unreadCount > 0 && !firstUnreadMessageId && lastReadIdx >= 0 ? 0 : unreadCount;
    const plan = resolveMessengerRoomEntryScrollPlan({
      intent: entryIntentRef.current,
      hasPersisted,
      unreadCount: effectiveUnread,
      lastReadMessageId,
      firstUnreadMessageId,
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
    const applied = tryCompleteEntry(plan.reason, source);
    if (!applied) {
      /** viewport 높이 미확정 — 다음 RO/layout에서 1회만 완료 (중첩 rAF settle 금지) */
      entryScrollScheduledRef.current = true;
    }
  }, [
    deferEntryScrollToDeliveryDirectTimeline,
    engine,
    lastReadMessageId,
    messageCount,
    notifyEntryFromPlan,
    roomId,
    roomMessages.length,
    stickToBottomRef,
    timelineHeavyReady,
    timelineInitialLoadComplete,
    timelineViewportMounted,
    tryCompleteEntry,
    unreadCount,
  ]);

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

  /**
   * Seeded snapshot merge(BootstrapGate 캐시 → background refresh)가 상단에 과거 메시지를
   * 끼워 넣을 때, explicit load-older(pagination)가 아닌데도 DOM만 커지고 scrollTop 보정이
   * 없으면 "최신이 잠깐 보였다가 예전 위치로 밀리는" 것처럼 보인다 — 첫 message id 변화를
   * append(tail)와 별개로 감지해, 이미 anchor 가 자리 잡은 뒤라면 즉시 재정렬(engine 재확인)한다.
   * loadingOlderMessages/prependInFlight 중이면 기존 explicit prepend 경로가 처리하므로 skip.
   */
  useLayoutEffect(() => {
    const head = roomMessages[0];
    const headId = head?.id ?? null;
    const prevHeadId = prevHeadMessageIdRef.current;
    prevHeadMessageIdRef.current = headId;
    if (prevHeadId === null || headId === prevHeadId) return;
    if (!hasAppliedInitialAnchorRef.current || !engine.isSettled()) return;
    if (loadingOlderMessages || engine.state.prependInFlight) return;
    engine.notifyLayoutResize(buildCtx());
  }, [buildCtx, engine, loadingOlderMessages, roomMessages]);

  useLayoutEffect(() => {
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

    /** Platform adapter input — scroll decision은 engine notifyLayoutResize 만 */
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
  }, [applyLayoutPreserve, engine, loadingOlderMessages, messagesViewportRef, tryCompleteEntry]);

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
  };
}
