"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";
import { CM_ROOM_CHROME_HEIGHT_SYNC_EVENT } from "@/lib/ui/cm-room-visible-viewport-contract";
import { isMessengerRoomNearBottomFromMetrics } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import {
  canRunMessengerRoomScrollOwner,
  isMessengerRoomEntryInitialScrollDone,
  markMessengerRoomEntryInitialScrollDone,
  markMessengerRoomEntryScrollSettled,
  markMessengerRoomScrollOwnerRun,
  resetMessengerRoomEntryScrollOwner,
  type CmScrollOwnerReason,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import { resolveMessengerRoomEntryScrollFinalize } from "@/lib/community-messenger/room/messenger-room-entry-scroll-settle";
import {
  consumeMessengerRoomEntryIntent,
  isMessengerEntryTailSettleReason,
  resolveMessengerRoomEntryScrollPlan,
  type MessengerRoomEntryIntent,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import {
  clearMessengerRoomScrollPosition,
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
import {
  isMessengerRoomEntryBottomScrollReason,
  isMessengerRoomComposerHeightSynced,
  resolveMessengerRoomEntryScrollPaintReady,
  snapshotMessengerRoomTimelineViewportProbe,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";
import { emitCmRoomTimelineEntryProbeLog } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { messengerRoomDistanceFromBottom } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";

/** entry tail settle — 이미 bottom 이면 재-scroll 생략 (깜빡임 방지) */
const MESSENGER_ENTRY_TAIL_SETTLE_SKIP_PX = 8;

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
  /** prepend fetch 중 chrome keep-bottom 이 읽기 위치를 덮어쓰지 않게 */
  loadingOlderMessages?: boolean;
};

function isAlwaysScrollReason(reason: CmScrollOwnerReason): boolean {
  return reason === "own_message_append" || reason === "explicit";
}

function isKeepBottomChromeReason(reason: CmScrollOwnerReason): boolean {
  return (
    reason === "viewport_resize_restore" ||
    reason === "viewport_resize_keep_bottom" ||
    reason === "keyboard_resize_keep_bottom" ||
    reason === "composer_resize_keep_bottom"
  );
}

function isEntryRestoreReason(reason: CmScrollOwnerReason): boolean {
  return (
    reason === "room_entry_initial" ||
    reason === "initial_load" ||
    reason === "push_entry_initial_load" ||
    reason === "room_entry_restore" ||
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
    loadingOlderMessages = false,
  } = opts;

  const lastScrollGeomRef = useRef<{ sh: number; st: number; ch: number; ready: boolean }>({
    sh: 0,
    st: 0,
    ch: 0,
    ready: false,
  });
  const queueRef = useRef<MessengerRoomScrollAnchorRequest[]>([]);
  const flushRafRef = useRef<number | null>(null);
  const entryScrollScheduledRef = useRef(false);
  const entryIntentRef = useRef<MessengerRoomEntryIntent>("default");
  const pendingTailSettleRef = useRef(false);
  const tailSettleDoneRef = useRef(false);
  const schedulePendingEntryTailSettleRef = useRef<() => void>(() => {});
  const composerSyncedForEntryRef = useRef(false);
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

  const logEntryScrollProbe = useCallback(
    (reason: CmScrollOwnerReason, paintReady: boolean) => {
      const rid = roomId.trim();
      if (!rid) return;
      const probe = snapshotMessengerRoomTimelineViewportProbe(
        messagesViewportRef.current,
        virtualizer
      );
      emitCmRoomTimelineEntryProbeLog(rid, reason, {
        ...probe,
        paintReady,
      });
    },
    [messagesViewportRef, roomId, virtualizer]
  );

  const requiresEntryBottomPaintReady = useCallback(
    (reason: CmScrollOwnerReason): boolean => {
      return (
        isMessengerRoomEntryBottomScrollReason(reason) ||
        isMessengerEntryTailSettleReason(reason) ||
        reason === "push_entry_initial_load" ||
        reason === "initial_load"
      );
    },
    []
  );

  const applyEntryScrollPhaseFinalize = useCallback(
    (reason: CmScrollOwnerReason, stickToBottom: boolean) => {
      const rid = roomId.trim();
      if (!rid) return;

      const vp = messagesViewportRef.current;
      const composerSynced = vp ? isMessengerRoomComposerHeightSynced(vp) : false;
      const decision = resolveMessengerRoomEntryScrollFinalize({
        reason,
        stickToBottom,
        composerHeightSynced: composerSynced,
      });

      if (decision.markInitialScrollDone) {
        markMessengerRoomEntryInitialScrollDone(rid, reason);
      }
      if (decision.markEntrySettled) {
        markMessengerRoomEntryScrollSettled(rid, reason);
      }
      if (decision.completeTailSettle) {
        tailSettleDoneRef.current = true;
        pendingTailSettleRef.current = false;
      } else if (decision.pendingTailSettle) {
        pendingTailSettleRef.current = true;
        tailSettleDoneRef.current = false;
      }
      if (
        decision.pendingTailSettle &&
        (composerSynced || composerSyncedForEntryRef.current)
      ) {
        schedulePendingEntryTailSettleRef.current();
      }
    },
    [messagesViewportRef, roomId]
  );

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
          const needsBottom = persisted.stickToBottom;
          if (needsBottom) {
            const paintReady = resolveMessengerRoomEntryScrollPaintReady({
              viewport: vp,
              virtualizer,
              messageCount,
              composerHeightSynced: true,
            });
            if (!paintReady) {
              logEntryScrollProbe(reason, false);
              return false;
            }
          } else if (vp.clientHeight <= 0) {
            logEntryScrollProbe(reason, false);
            return false;
          }
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
            applyEntryScrollPhaseFinalize(reason, persisted.stickToBottom);
          }
          return true;
        }
      }

      const alwaysScroll =
        force || isAlwaysScrollReason(reason) || isMessengerEntryTailSettleReason(reason);
      if (!alwaysScroll && !isEntryRestoreReason(reason) && !isKeepBottomChromeReason(reason)) {
        const nearBottom = resolveMessengerRoomNearBottomForAutoScroll({
          viewport: vp,
          stickToBottomRef,
          roomId,
          activeSheet,
          lastScrollGeomRef,
        });
        if (!nearBottom) return true;
      }

      if (isKeepBottomChromeReason(reason) && !stickToBottomRef.current && !force) {
        return true;
      }

      if (requiresEntryBottomPaintReady(reason)) {
        const paintReady = resolveMessengerRoomEntryScrollPaintReady({
          viewport: vp,
          virtualizer,
          messageCount,
          composerHeightSynced: true,
        });
        if (!paintReady) {
          logEntryScrollProbe(reason, false);
          return false;
        }
      }

      if (alwaysScroll || isEntryRestoreReason(reason) || isKeepBottomChromeReason(reason)) {
        const count = messageCount;
        if (
          count > 0 &&
          virtualizer &&
          (reason === "room_entry_initial" ||
            reason === "initial_load" ||
            reason === "push_entry_initial_load") &&
          (virtualizer.getTotalSize?.() ?? 0) <= 0 &&
          vp.querySelectorAll("[data-cm-timeline-message-row]").length <= 0
        ) {
          logEntryScrollProbe(reason, false);
          return false;
        }
        if (
          count > 0 &&
          virtualizer &&
          (alwaysScroll || !isKeepBottomChromeReason(reason))
        ) {
          const tailSettleReason = isMessengerEntryTailSettleReason(reason);
          const distFromBottom = messengerRoomDistanceFromBottom({
            scrollHeight: vp.scrollHeight,
            scrollTop: vp.scrollTop,
            clientHeight: vp.clientHeight,
          });
          if (!(tailSettleReason && distFromBottom <= MESSENGER_ENTRY_TAIL_SETTLE_SKIP_PX)) {
            if (!tailSettleReason) {
              try {
                virtualizer.scrollToIndex(count - 1, { align: "end" });
              } catch {
                /* virtualizer not ready */
              }
            }
            vp.scrollTop = vp.scrollHeight;
          }
        } else {
          vp.scrollTop = vp.scrollHeight;
        }
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
        if (
          isEntryRestoreReason(reason) ||
          reason === "room_entry_restore" ||
          isMessengerEntryTailSettleReason(reason)
        ) {
          applyEntryScrollPhaseFinalize(reason, stickToBottomRef.current);
        }
      }
      return true;
    },
    [
      activeSheet,
      applyEntryScrollPhaseFinalize,
      messageCount,
      messagesViewportRef,
      roomId,
      stickToBottomRef,
      syncScrollGeomFromViewport,
      virtualizer,
      logEntryScrollProbe,
      requiresEntryBottomPaintReady,
    ]
  );

  const flushScrollQueue = useCallback(() => {
    flushRafRef.current = null;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    if (batch.length === 0) return;

    const deduped: MessengerRoomScrollAnchorRequest[] = [];
    for (const req of batch) {
      const prev = deduped[deduped.length - 1];
      if (
        prev &&
        isKeepBottomChromeReason(prev.reason) &&
        isKeepBottomChromeReason(req.reason) &&
        prev.force === req.force
      ) {
        deduped[deduped.length - 1] = req;
        continue;
      }
      deduped.push(req);
    }

    for (const req of deduped) {
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

  const schedulePendingEntryTailSettle = useCallback(() => {
    if (!pendingTailSettleRef.current || tailSettleDoneRef.current) return;
    const rid = roomId.trim();
    if (!rid || !isMessengerRoomEntryInitialScrollDone(rid)) return;

    const run = () => {
      if (!pendingTailSettleRef.current || tailSettleDoneRef.current) return;
      const reason =
        entryIntentRef.current === "push" ? "push_entry_tail_settle" : "entry_tail_settle";
      enqueueScrollAnchor({ reason, force: true });
    };

    if (typeof requestAnimationFrame !== "function") {
      run();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [enqueueScrollAnchor, roomId]);

  useEffect(() => {
    schedulePendingEntryTailSettleRef.current = schedulePendingEntryTailSettle;
  }, [schedulePendingEntryTailSettle]);

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
    entryScrollScheduledRef.current = false;
    pendingTailSettleRef.current = false;
    tailSettleDoneRef.current = false;
    composerSyncedForEntryRef.current = false;
    prevTailMessageIdRef.current = null;
    prevTailClientMessageIdRef.current = null;

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
    enqueueScrollAnchor({
      reason: plan.reason,
      force: plan.forceBottom && plan.reason === "push_entry_initial_load",
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
    const onChromeHeightSynced = (ev: Event) => {
      const rid = roomId.trim();
      if (!rid) return;
      const detail = (ev as CustomEvent<{ roomId?: string }>).detail;
      if (detail?.roomId && detail.roomId !== rid) return;
      composerSyncedForEntryRef.current = true;

      if (!pendingTailSettleRef.current || tailSettleDoneRef.current) return;
      if (!isMessengerRoomEntryInitialScrollDone(rid)) return;
      schedulePendingEntryTailSettle();
    };

    window.addEventListener(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, onChromeHeightSynced);
    return () => {
      window.removeEventListener(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, onChromeHeightSynced);
    };
  }, [roomId, schedulePendingEntryTailSettle]);

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
        enqueueScrollAnchor({ reason: "own_message_append" });
      } else {
        const nearBottom = resolveMessengerRoomNearBottomForAutoScroll({
          viewport: messagesViewportRef.current,
          stickToBottomRef,
          roomId,
          activeSheet,
          lastScrollGeomRef,
        });
        if (nearBottom) {
          enqueueScrollAnchor({ reason: "peer_message_near_bottom" });
        }
      }
    }
    if (last?.id) {
      prevTailMessageIdRef.current = last.id;
      prevTailClientMessageIdRef.current = last.clientMessageId ?? null;
    }
  }, [activeSheet, enqueueScrollAnchor, roomId, roomMessages, stickToBottomRef]);

  useLayoutEffect(() => {
    const el = messagesViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const preserveOrKeepBottom = (reason: CmScrollOwnerReason) => {
      if (loadingOlderMessages) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          const rid = roomId.trim();
          if (rid && !canRunMessengerRoomScrollOwner(rid, reason)) return;
          const box = messagesViewportRef.current;
          if (!box || !lastScrollGeomRef.current.ready) return;
          const prev = lastScrollGeomRef.current;
          const stBefore = box.scrollTop;
          const sh = box.scrollHeight;
          const ch = box.clientHeight;
          const maxScroll = Math.max(0, sh - ch);
          const liveDistFromBottom = Math.max(0, sh - stBefore - ch);
          const wasNearBottom = isMessengerRoomNearBottomFromMetrics(
            { scrollHeight: prev.sh, scrollTop: prev.st, clientHeight: prev.ch },
            MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX
          );
          if (wasNearBottom) {
            stickToBottomRef.current = true;
            enqueueScrollAnchor({ reason });
            return;
          }
          const target = maxScroll - liveDistFromBottom;
          box.scrollTop = Math.max(0, Math.min(maxScroll, target));
          syncMessengerRoomStickToBottomFromViewport({
            viewport: box,
            stickToBottomRef,
            roomId,
            activeSheet,
          });
          syncScrollGeomFromViewport();
          persistScrollPosition();
        });
      });
    };

    const roTimeline = new ResizeObserver(() => preserveOrKeepBottom("viewport_resize_keep_bottom"));
    roTimeline.observe(el);

    const onLayoutViewport = () => preserveOrKeepBottom("viewport_resize_keep_bottom");
    window.addEventListener("resize", onLayoutViewport);
    window.addEventListener("orientationchange", onLayoutViewport);

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const onVv = () => preserveOrKeepBottom("keyboard_resize_keep_bottom");
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
  }, [
    activeSheet,
    enqueueScrollAnchor,
    messagesViewportRef,
    persistScrollPosition,
    roomId,
    stickToBottomRef,
    syncScrollGeomFromViewport,
    loadingOlderMessages,
  ]);

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
