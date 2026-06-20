"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { CM_ROOM_CHROME_HEIGHT_SYNC_EVENT } from "@/lib/ui/cm-room-visible-viewport-contract";
import { createChatThreadScrollEngine, type ChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";
import type { ChatThreadScrollRestoreSnapshot, ChatThreadVirtualizer } from "@/lib/chat-thread-scroll/types";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import {
  consumeMessengerRoomEntryIntent,
  isMessengerEntryBottomLoadReason,
  isMessengerEntryTailSettleReason,
  resolveMessengerRoomEntryScrollPlan,
  type MessengerRoomEntryIntent,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import {
  resolveMessengerRoomEntryScrollPaintReady,
  isMessengerRoomComposerHeightSynced,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";
import {
  markMessengerRoomEntryScrollSettled,
  markMessengerRoomScrollOwnerRun,
  resetMessengerRoomEntryScrollOwner,
  isMessengerRoomEntryScrollSettled,
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
  /** bootstrap initial fetch 완료 — 진입 scroll 1회 게이트 (Android/iOS 동일) */
  timelineInitialLoadComplete?: boolean;
  /** displayRoomMessages fingerprint — bootstrap merge 후 tail re-anchor */
  roomMessagesFingerprint?: string;
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
    reason === "schedule_after_rows_painted" ||
    reason === "push_entry_tail_settle" ||
    reason === "entry_tail_settle"
  );
}

function isLayoutKeepBottomReason(reason: CmScrollOwnerReason): boolean {
  return (
    reason === "viewport_resize_restore" ||
    reason === "viewport_resize_keep_bottom" ||
    reason === "keyboard_resize_keep_bottom" ||
    reason === "composer_resize_keep_bottom" ||
    reason === "virtualizer_scroll_anchor"
  );
}

/** CM thin wrapper — scrollTop/scrollToIndex 는 `lib/chat-thread-scroll/engine` 만 사용. */
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
    roomMessagesFingerprint = "",
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
          composerHeightSynced: true,
        }),
    });
  }
  const engine = engineRef.current;

  const entryIntentRef = useRef<MessengerRoomEntryIntent>("default");
  const entryScrollScheduledRef = useRef(false);
  const pendingTailSettleRef = useRef(false);
  const tailSettleDoneRef = useRef(false);
  const prevTailMessageIdRef = useRef<string | null>(null);
  const prevTailClientMessageIdRef = useRef<string | null>(null);
  const entryRetryRafRef = useRef<number | null>(null);
  const prevRoomMessagesFingerprintRef = useRef("");

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
    (reason: CmScrollOwnerReason) => {
      const rid = roomId.trim();
      const vp = messagesViewportRef.current;
      if (!rid) return;
      markMessengerRoomScrollOwnerRun(rid, reason, {
        scrollTop: vp?.scrollTop,
        scrollHeight: vp?.scrollHeight,
        clientHeight: vp?.clientHeight,
      });
    },
    [messagesViewportRef, roomId]
  );

  const completeEntryPhase = useCallback(
    (reason: CmScrollOwnerReason) => {
      const rid = roomId.trim();
      if (!rid || engine.getPhase() !== "settled") return;
      markMessengerRoomEntryScrollSettled(rid, reason);
      if (messengerRoomTracksScrollPosition() && stickToBottomRef.current) {
        useMessengerRoomReaderStateStore.getState().setScrollPosition(rid, "at-bottom");
      }
    },
    [engine, roomId, stickToBottomRef]
  );

  const tryCompleteEntry = useCallback(
    (reason: CmScrollOwnerReason) => {
      const ok = engine.tryCompleteEntry(buildCtx());
      if (ok) {
        stickToBottomRef.current = engine.readStickToBottom();
        markCmScrollRun(reason);
        completeEntryPhase(reason);
        const vp = messagesViewportRef.current;
        if (isMessengerEntryBottomLoadReason(reason) && vp) {
          if (isMessengerRoomComposerHeightSynced(vp)) {
            tailSettleDoneRef.current = true;
            pendingTailSettleRef.current = false;
          } else {
            pendingTailSettleRef.current = true;
          }
        }
        return true;
      }
      if (engine.getPhase() === "entryPendingLayout" && typeof requestAnimationFrame === "function") {
        if (entryRetryRafRef.current != null) cancelAnimationFrame(entryRetryRafRef.current);
        entryRetryRafRef.current = requestAnimationFrame(() => {
          entryRetryRafRef.current = requestAnimationFrame(() => {
            entryRetryRafRef.current = null;
            tryCompleteEntry(reason);
          });
        });
      }
      return false;
    },
    [buildCtx, completeEntryPhase, engine, markCmScrollRun, messagesViewportRef, stickToBottomRef]
  );

  const schedulePendingEntryTailSettle = useCallback(() => {
    if (!pendingTailSettleRef.current || tailSettleDoneRef.current) return;
    const rid = roomId.trim();
    if (!rid || !isMessengerRoomEntryScrollSettled(rid)) return;

    const run = () => {
      if (!pendingTailSettleRef.current || tailSettleDoneRef.current) return;
      tailSettleDoneRef.current = true;
      pendingTailSettleRef.current = false;
      const reason =
        entryIntentRef.current === "push" ? "push_entry_tail_settle" : "entry_tail_settle";
      scrollMessengerToBottomRef.current({ reason, force: true });
    };

    if (typeof requestAnimationFrame !== "function") {
      run();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [roomId]);

  const scrollMessengerToBottomRef = useRef<
    (req?: { reason?: CmScrollOwnerReason; force?: boolean }) => void
  >(() => {});

  const notifyEntryFromPlan = useCallback(
    (reason: CmScrollOwnerReason, forceBottom: boolean) => {
      const rid = roomId.trim();
      const vp = messagesViewportRef.current;
      let restoreSnapshot: ChatThreadScrollRestoreSnapshot | null = null;

      if (reason === "room_entry_restore" && rid) {
        const persisted = consumeMessengerRoomScrollPosition(rid);
        if (persisted) {
          if (persisted.stickToBottom) {
            engine.notifyEntry({ forceBottom: true });
            stickToBottomRef.current = true;
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
        }
      }

      engine.notifyEntry({ forceBottom: forceBottom && !restoreSnapshot, restoreSnapshot });
      if (forceBottom) stickToBottomRef.current = true;
    },
    [engine, messagesViewportRef, roomId, stickToBottomRef]
  );

  const scrollMessengerToBottom = useCallback(
    (req?: { reason?: CmScrollOwnerReason; force?: boolean }) => {
      const reason = req?.reason ?? "explicit";
      const force = req?.force === true || isExplicitScrollReason(reason);

      if (isMessengerEntryTailSettleReason(reason)) {
        engine.scrollToBottomExplicit(buildCtx());
        stickToBottomRef.current = true;
        markCmScrollRun(reason);
        tailSettleDoneRef.current = true;
        pendingTailSettleRef.current = false;
        return;
      }

      if (isEntryScrollReason(reason)) {
        engine.notifyMessagesReady(messageCount > 0);
        engine.notifyLayoutCommitted();
        tryCompleteEntry(reason);
        return;
      }

      if (force) {
        engine.scrollToBottomExplicit(buildCtx());
        stickToBottomRef.current = true;
        markCmScrollRun(reason);
        return;
      }

      if (isLayoutKeepBottomReason(reason)) {
        if (loadingOlderMessages) return;
        if (engine.getPhase() !== "settled") return;
        if (!stickToBottomRef.current) {
          engine.notifyLayoutResize(buildCtx());
          syncMessengerRoomStickToBottomFromViewport({
            viewport: messagesViewportRef.current,
            stickToBottomRef,
            roomId,
            activeSheet,
          });
          persistScrollPosition();
          return;
        }
        engine.notifyLayoutResize(buildCtx());
        stickToBottomRef.current = true;
        markCmScrollRun(reason);
        return;
      }

      engine.notifyAppend(buildCtx());
    },
    [
      activeSheet,
      buildCtx,
      engine,
      loadingOlderMessages,
      markCmScrollRun,
      messageCount,
      messagesViewportRef,
      persistScrollPosition,
      roomId,
      stickToBottomRef,
      tryCompleteEntry,
    ]
  );

  useEffect(() => {
    scrollMessengerToBottomRef.current = scrollMessengerToBottom;
  }, [scrollMessengerToBottom]);

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
  }, [activeSheet, buildCtx, engine, messagesViewportRef, persistScrollPosition, roomId, stickToBottomRef]);

  useLayoutEffect(() => {
    const rid = roomId.trim();
    if (rid) resetMessengerRoomEntryScrollOwner(rid);
    engine.reset();
    entryScrollScheduledRef.current = false;
    pendingTailSettleRef.current = false;
    tailSettleDoneRef.current = false;
    prevTailMessageIdRef.current = null;
    prevTailClientMessageIdRef.current = null;
    prevRoomMessagesFingerprintRef.current = "";

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

  useLayoutEffect(() => {
    if (deferEntryScrollToDeliveryDirectTimeline || roomMessages.length <= 0) return;
    if (!timelineViewportMounted || !timelineHeavyReady) return;
    if (!timelineInitialLoadComplete) return;
    if (entryScrollScheduledRef.current) return;

    const rid = roomId.trim();
    const hasPersisted = Boolean(peekMessengerRoomScrollPosition(rid));
    const plan = resolveMessengerRoomEntryScrollPlan({
      intent: entryIntentRef.current,
      hasPersisted,
    });
    if (plan.clearPersist && rid) clearMessengerRoomScrollPosition(rid);
    if (plan.forceBottom) stickToBottomRef.current = true;

    entryScrollScheduledRef.current = true;
    notifyEntryFromPlan(plan.reason, plan.forceBottom);
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    tryCompleteEntry(plan.reason);
  }, [
    deferEntryScrollToDeliveryDirectTimeline,
    engine,
    notifyEntryFromPlan,
    roomId,
    roomMessages.length,
    stickToBottomRef,
    timelineHeavyReady,
    timelineInitialLoadComplete,
    timelineViewportMounted,
    tryCompleteEntry,
  ]);

  /** bootstrap merge — call_stub+text 한 스트림 paint 후 tail (플랫폼 공통 JS) */
  useLayoutEffect(() => {
    const fp = roomMessagesFingerprint;
    const prevFp = prevRoomMessagesFingerprintRef.current;
    prevRoomMessagesFingerprintRef.current = fp;
    if (!prevFp || prevFp === fp) return;
    if (deferEntryScrollToDeliveryDirectTimeline || loadingOlderMessages) return;
    if (!stickToBottomRef.current || messageCount <= 0) return;

    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    if (engine.getPhase() === "entryPendingLayout") {
      tryCompleteEntry("initial_load");
      return;
    }
    scrollMessengerToBottom({ reason: "entry_tail_settle", force: true });
  }, [
    deferEntryScrollToDeliveryDirectTimeline,
    engine,
    loadingOlderMessages,
    messageCount,
    roomMessagesFingerprint,
    scrollMessengerToBottom,
    stickToBottomRef,
    tryCompleteEntry,
  ]);

  useEffect(() => {
    engine.notifyPrependInFlight(loadingOlderMessages);
  }, [engine, loadingOlderMessages]);

  useEffect(() => {
    const onChromeHeightSynced = (ev: Event) => {
      const rid = roomId.trim();
      if (!rid) return;
      const detail = (ev as CustomEvent<{ roomId?: string }>).detail;
      if (detail?.roomId && detail.roomId !== rid) return;
      engine.notifyLayoutCommitted();
      if (engine.getPhase() === "entryPendingLayout") {
        tryCompleteEntry("entry_tail_settle");
        return;
      }
      if (pendingTailSettleRef.current && !tailSettleDoneRef.current) {
        schedulePendingEntryTailSettle();
        return;
      }
      if (engine.isSettled() && stickToBottomRef.current && !loadingOlderMessages) {
        engine.notifyLayoutResize(buildCtx());
      }
    };

    window.addEventListener(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, onChromeHeightSynced);
    return () => window.removeEventListener(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, onChromeHeightSynced);
  }, [
    buildCtx,
    engine,
    loadingOlderMessages,
    roomId,
    schedulePendingEntryTailSettle,
    stickToBottomRef,
    tryCompleteEntry,
  ]);

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
    const el = messagesViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const onViewportResize = () => {
      if (loadingOlderMessages) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          if (engine.getPhase() === "entryPendingLayout") {
            tryCompleteEntry("viewport_resize_keep_bottom");
            return;
          }
          if (!engine.isSettled()) return;
          scrollMessengerToBottom({ reason: "viewport_resize_keep_bottom" });
        });
      });
    };

    const roTimeline = new ResizeObserver(onViewportResize);
    roTimeline.observe(el);

    const onLayoutViewport = () => onViewportResize();
    window.addEventListener("resize", onLayoutViewport);
    window.addEventListener("orientationchange", onLayoutViewport);

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const onVv = () => {
      if (engine.getPhase() === "entryPendingLayout") return;
      scrollMessengerToBottom({ reason: "keyboard_resize_keep_bottom" });
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);

    return () => {
      cancelAnimationFrame(rafId);
      roTimeline.disconnect();
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onLayoutViewport);
      window.removeEventListener("orientationchange", onLayoutViewport);
    };
  }, [engine, loadingOlderMessages, messagesViewportRef, scrollMessengerToBottom, tryCompleteEntry]);

  useEffect(() => {
    return () => {
      if (entryRetryRafRef.current != null) cancelAnimationFrame(entryRetryRafRef.current);
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
