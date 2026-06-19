"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";
import { isMessengerRoomNearBottomFromMetrics } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import {
  canRunMessengerRoomScrollOwner,
  markMessengerRoomEntryScrollSettled,
  markMessengerRoomScrollOwnerRun,
  resetMessengerRoomEntryScrollOwner,
  type CmScrollOwnerReason,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import {
  consumeMessengerRoomScrollPosition,
  peekMessengerRoomScrollPosition,
  resolveScrollTopForAnchorMessage,
  saveMessengerRoomScrollPosition,
  snapshotScrollFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-position-store";
import {
  resolveMessengerRoomNearBottomForAutoScroll,
  syncMessengerRoomStickToBottomFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS } from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";
import { messengerRoomTracksScrollPosition } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";

export type MessengerRoomScrollAnchorRequest = {
  reason: CmScrollOwnerReason;
  force?: boolean;
  retryCount?: number;
};

const MAX_SCROLL_APPLY_RETRIES = 12;

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
};

function isAlwaysScrollReason(reason: CmScrollOwnerReason): boolean {
  return reason === "own_message_append" || reason === "explicit";
}

function isEntryRestoreReason(reason: CmScrollOwnerReason): boolean {
  return (
    reason === "room_entry_restore" ||
    reason === "room_entry_initial" ||
    reason === "timeline_delivery_direct_paint" ||
    reason === "schedule_after_rows_painted"
  );
}

/**
 * 채팅방 scroll owner 단일 queue — entry / append / resize / prepend 결과를 순차 처리.
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
  } = opts;

  const lastScrollGeomRef = useRef<{ sh: number; st: number; ch: number; ready: boolean }>({
    sh: 0,
    st: 0,
    ch: 0,
    ready: false,
  });
  const queueRef = useRef<MessengerRoomScrollAnchorRequest[]>([]);
  const flushRafRef = useRef<number | null>(null);
  const entryScrollDoneRef = useRef(false);
  const prevTailMessageIdRef = useRef<string | null>(null);
  const prevTailClientMessageIdRef = useRef<string | null>(null);

  const syncScrollGeomFromViewport = useCallback(() => {
    const el = messagesViewportRef.current;
    if (!el) return;
    lastScrollGeomRef.current = {
      sh: el.scrollHeight,
      st: el.scrollTop,
      ch: el.clientHeight,
      ready: true,
    };
  }, [messagesViewportRef]);

  const persistScrollPosition = useCallback(() => {
    const rid = roomId.trim();
    if (!rid) return;
    const snap = snapshotScrollFromViewport(messagesViewportRef.current, stickToBottomRef.current);
    if (!snap) return;
    saveMessengerRoomScrollPosition(rid, snap);
  }, [roomId, messagesViewportRef, stickToBottomRef]);

  const applyScrollRequest = useCallback(
    (request: MessengerRoomScrollAnchorRequest): boolean => {
      const rid = roomId.trim();
      const reason = request.reason;
      const force = request.force === true;

      if (rid && !force && !canRunMessengerRoomScrollOwner(rid, reason)) {
        return true;
      }

      const vp = messagesViewportRef.current;
      if (!vp) return false;

      if (reason === "prepend_older_preserve_position") {
        syncScrollGeomFromViewport();
        return true;
      }

      if (reason === "room_entry_restore") {
        const persisted = consumeMessengerRoomScrollPosition(rid);
        if (persisted) {
          if (persisted.stickToBottom) {
            vp.scrollTop = vp.scrollHeight;
            stickToBottomRef.current = true;
          } else if (persisted.firstVisibleMessageId) {
            const anchorTop = resolveScrollTopForAnchorMessage(vp, persisted.firstVisibleMessageId);
            if (anchorTop == null && messageCount > MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS) {
              vp.scrollTop = persisted.scrollTop;
              return false;
            }
            vp.scrollTop = anchorTop ?? persisted.scrollTop;
            stickToBottomRef.current = false;
          } else {
            vp.scrollTop = persisted.scrollTop;
            stickToBottomRef.current = persisted.stickToBottom;
          }
          syncScrollGeomFromViewport();
          syncMessengerRoomStickToBottomFromViewport({
            viewport: vp,
            stickToBottomRef,
            roomId,
            activeSheet,
          });
          if (rid) {
            markMessengerRoomScrollOwnerRun(rid, reason, {
              scrollTop: vp.scrollTop,
              scrollHeight: vp.scrollHeight,
              clientHeight: vp.clientHeight,
            });
            markMessengerRoomEntryScrollSettled(rid, reason);
          }
          return true;
        }
      }

      const alwaysScroll = force || isAlwaysScrollReason(reason);
      if (!alwaysScroll && !isEntryRestoreReason(reason)) {
        const nearBottom = resolveMessengerRoomNearBottomForAutoScroll({
          viewport: vp,
          stickToBottomRef,
          roomId,
          activeSheet,
          lastScrollGeomRef,
        });
        if (!nearBottom) return true;
      }

      if (alwaysScroll || isEntryRestoreReason(reason)) {
        const count = messageCount;
        if (
          count > 0 &&
          virtualizer &&
          reason === "room_entry_initial" &&
          (virtualizer.getTotalSize?.() ?? 0) <= 0
        ) {
          return false;
        }
        if (count > 0 && virtualizer && (alwaysScroll || reason !== "viewport_resize_restore")) {
          try {
            virtualizer.scrollToIndex(count - 1, { align: "end" });
          } catch {
            /* virtualizer not ready */
          }
        }
        vp.scrollTop = vp.scrollHeight;
        if (rid && messengerRoomTracksScrollPosition()) {
          useMessengerRoomReaderStateStore.getState().setScrollPosition(rid, "at-bottom");
        }
        stickToBottomRef.current = true;
      }

      syncScrollGeomFromViewport();
      syncMessengerRoomStickToBottomFromViewport({
        viewport: vp,
        stickToBottomRef,
        roomId,
        activeSheet,
        lastScrollGeomRef,
      });

      if (rid) {
        markMessengerRoomScrollOwnerRun(rid, reason, {
          scrollTop: vp.scrollTop,
          scrollHeight: vp.scrollHeight,
          clientHeight: vp.clientHeight,
        });
        if (isEntryRestoreReason(reason) || reason === "room_entry_restore") {
          markMessengerRoomEntryScrollSettled(rid, reason);
        }
      }
      return true;
    },
    [
      activeSheet,
      messageCount,
      messagesViewportRef,
      roomId,
      stickToBottomRef,
      syncScrollGeomFromViewport,
      virtualizer,
    ]
  );

  const flushScrollQueue = useCallback(() => {
    flushRafRef.current = null;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    if (batch.length === 0) return;
    for (const req of batch) {
      const applied = applyScrollRequest(req);
      if (!applied) {
        const retryCount = (req.retryCount ?? 0) + 1;
        if (retryCount <= MAX_SCROLL_APPLY_RETRIES) {
          queueRef.current.push({ ...req, retryCount });
        }
      }
    }
    if (queueRef.current.length > 0) {
      if (typeof requestAnimationFrame !== "function") {
        flushScrollQueue();
        return;
      }
      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = requestAnimationFrame(flushScrollQueue);
      });
    }
  }, [applyScrollRequest]);

  const enqueueScrollAnchor = useCallback(
    (request: MessengerRoomScrollAnchorRequest) => {
      queueRef.current.push(request);
      if (flushRafRef.current != null) return;
      if (typeof requestAnimationFrame !== "function") {
        flushScrollQueue();
        return;
      }
      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = requestAnimationFrame(flushScrollQueue);
      });
    },
    [flushScrollQueue]
  );

  const scrollMessengerToBottom = useCallback(
    (req?: { reason?: CmScrollOwnerReason; force?: boolean }) => {
      enqueueScrollAnchor({
        reason: req?.reason ?? "explicit",
        force: req?.force,
      });
    },
    [enqueueScrollAnchor]
  );

  const updateStickToBottomFromScroll = useCallback(() => {
    syncMessengerRoomStickToBottomFromViewport({
      viewport: messagesViewportRef.current,
      stickToBottomRef,
      roomId,
      activeSheet,
      emitScrollLogs: true,
      lastScrollGeomRef,
    });
    persistScrollPosition();
  }, [activeSheet, messagesViewportRef, persistScrollPosition, roomId, stickToBottomRef]);

  useLayoutEffect(() => {
    const rid = roomId.trim();
    if (rid) resetMessengerRoomEntryScrollOwner(rid);
    entryScrollDoneRef.current = false;
    prevTailMessageIdRef.current = null;
    prevTailClientMessageIdRef.current = null;
    stickToBottomRef.current = peekMessengerRoomScrollPosition(rid)?.stickToBottom ?? true;
    const el = messagesViewportRef.current;
    if (!el) {
      lastScrollGeomRef.current = { sh: 0, st: 0, ch: 0, ready: false };
      return;
    }
    lastScrollGeomRef.current = {
      sh: el.scrollHeight,
      st: el.scrollTop,
      ch: el.clientHeight,
      ready: true,
    };
  }, [roomId, messagesViewportRef, stickToBottomRef]);

  useLayoutEffect(() => {
    if (deferEntryScrollToDeliveryDirectTimeline || roomMessages.length <= 0) return;
    if (!timelineViewportMounted) return;
    if (!timelineHeavyReady) return;
    if (entryScrollDoneRef.current) return;
    entryScrollDoneRef.current = true;

    const rid = roomId.trim();
    const hasPersisted = Boolean(peekMessengerRoomScrollPosition(rid));
    enqueueScrollAnchor({
      reason: hasPersisted ? "room_entry_restore" : "room_entry_initial",
    });
  }, [
    deferEntryScrollToDeliveryDirectTimeline,
    enqueueScrollAnchor,
    roomId,
    roomMessages.length,
    timelineHeavyReady,
    timelineViewportMounted,
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
      enqueueScrollAnchor({ reason: decision.reason });
    }
    if (last?.id) {
      prevTailMessageIdRef.current = last.id;
      prevTailClientMessageIdRef.current = last.clientMessageId ?? null;
    }
  }, [enqueueScrollAnchor, roomMessages]);

  useLayoutEffect(() => {
    const el = messagesViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const restoreScrollAfterChromeChange = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rid = roomId.trim();
        if (!canRunMessengerRoomScrollOwner(rid, "viewport_resize_restore")) return;
        const box = messagesViewportRef.current;
        if (!box || !lastScrollGeomRef.current.ready) return;
        const prev = lastScrollGeomRef.current;
        const stBefore = box.scrollTop;
        const sh = box.scrollHeight;
        const ch = box.clientHeight;
        const maxScroll = Math.max(0, sh - ch);
        const liveDistFromBottom = Math.max(0, sh - stBefore - ch);
        const viewportShrunk = ch < prev.ch - 6;
        const wasNearBottom = isMessengerRoomNearBottomFromMetrics(
          { scrollHeight: prev.sh, scrollTop: prev.st, clientHeight: prev.ch },
          MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX
        );
        const nearBottomNow = syncMessengerRoomStickToBottomFromViewport({
          viewport: box,
          stickToBottomRef,
          roomId,
          activeSheet,
        });
        if (nearBottomNow || (viewportShrunk && wasNearBottom)) {
          if (viewportShrunk && wasNearBottom) stickToBottomRef.current = true;
          box.scrollTop = maxScroll;
        } else {
          const target = maxScroll - liveDistFromBottom;
          box.scrollTop = Math.max(0, Math.min(maxScroll, target));
        }
        syncScrollGeomFromViewport();
        persistScrollPosition();
      });
    };

    const ro = new ResizeObserver(() => restoreScrollAfterChromeChange());
    ro.observe(el);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const onVv = () => restoreScrollAfterChromeChange();
    const onLayoutViewport = () => restoreScrollAfterChromeChange();
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    window.addEventListener("resize", onLayoutViewport);
    window.addEventListener("orientationchange", onLayoutViewport);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onLayoutViewport);
      window.removeEventListener("orientationchange", onLayoutViewport);
    };
  }, [activeSheet, messagesViewportRef, persistScrollPosition, roomId, stickToBottomRef, syncScrollGeomFromViewport]);

  useEffect(() => {
    return () => {
      if (flushRafRef.current != null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      persistScrollPosition();
      queueRef.current = [];
    };
  }, [persistScrollPosition]);

  return {
    scrollMessengerToBottom,
    updateStickToBottomFromScroll,
    persistScrollPosition,
    enqueueScrollAnchor,
  };
}
