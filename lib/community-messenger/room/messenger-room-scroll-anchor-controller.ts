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
  isMessengerRoomTimelineTipEntryConsumed,
  markMessengerRoomTimelineTipEntryConsumed,
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
  saveMessengerRoomReturnHistory,
  saveMessengerRoomScrollPosition,
  snapshotScrollFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-position-store";
import {
  clearMessengerRoomReturnEntry,
  peekMessengerRoomReturnEntry,
} from "@/lib/community-messenger/room/messenger-room-return-entry";
import {
  cancelMessengerRoomReaderStateSync,
  scheduleMessengerRoomReaderStateSync,
  syncMessengerRoomReaderStateFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
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
    | "invite"
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
  roomMessages: Array<{
    id?: string;
    isMine?: boolean;
    clientMessageId?: string | null;
    pending?: boolean;
    messageType?: string | null;
  }>;
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

/** 메시지로 이동 시 상단 여백(날짜 구분선·스티키 헤더에 가리지 않게) */
const MESSENGER_JUMP_TO_MESSAGE_TOP_INSET_PX = 12;

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
    reason === "content_resize_keep_bottom" ||
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
 * Single scroll authority for CM rooms (Kakao contract).
 * - Initial anchor: room generation 당 1회, useLayoutEffect (paint 전)
 * - Resize/keyboard/chrome: settled 이후 preserve/follow 만 — 재 entry·tail settle 금지
 * - scrollTop 조작은 ChatThreadScrollEngine 만
 */
export type ScrollToMessageAlign = "start" | "center" | "end" | "auto";

export function useMessengerRoomScrollAnchorController(opts: ScrollAnchorControllerOpts): {
  scrollMessengerToBottom: (request?: { reason?: CmScrollOwnerReason; force?: boolean }) => void;
  scrollMessengerToMessage: (
    messageId: string,
    opts?: { align?: ScrollToMessageAlign }
  ) => boolean;
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
      /**
       * F2-④ (설계 2026-11-18 PR-1): 진입 완료 시 읽기 상태(위치·lastVisible)는 stickToBottomRef 가 아니라
       * **viewport 를 읽어** 기록한다 — 스크롤 이벤트가 없는 짧은 방·첫 안 읽음 앵커 진입도 실제 위치와 맞는다.
       * 엔진 기준 stickToBottomRef 는 바꾸지 않도록 임시 ref 로 읽는다. viewport 가 없으면 예전 규칙.
       */
      const entryViewport = messagesViewportRef.current;
      if (entryViewport) {
        syncMessengerRoomReaderStateFromViewport({
          viewport: entryViewport,
          stickToBottomRef: { current: stickToBottomRef.current },
          roomId: rid,
          activeSheet,
        });
      } else if (messengerRoomTracksScrollPosition() && stickToBottomRef.current) {
        useMessengerRoomReaderStateStore.getState().setScrollPosition(rid, "at-bottom");
      }
      /** Latest land → tip consumed so same-tip re-entry cannot revive stale first-unread. */
      if (stickToBottomRef.current || isMessengerEntryBottomLoadReason(reason)) {
        const tip = roomMessages[roomMessages.length - 1]?.id?.trim();
        if (tip) {
          markMessengerRoomTimelineTipEntryConsumed(rid, tip);
          clearMessengerRoomScrollPosition(rid);
        }
      }
    },
    [activeSheet, engine, markCmScrollRun, messagesViewportRef, roomId, roomMessages, stickToBottomRef]
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
      planAnchorMessageId?: string | null,
      planAnchorOffsetPx?: number | null
    ) => {
      const vp = messagesViewportRef.current;
      let restoreSnapshot: ChatThreadScrollRestoreSnapshot | null = null;

      /**
       * Unread Enter(첫 안 읽은 메시지) · D4 돌아옴(보던 메시지 + 화면 안 위치). 목록 누름 재진입은 여기로 오지 않는다.
       */
      if (reason === "room_entry_restore") {
        const anchorId = planAnchorMessageId?.trim() || "";
        if (anchorId && vp) {
          const anchorTop = resolveScrollTopForAnchorMessage(vp, anchorId);
          if (anchorTop != null) {
            const offset =
              typeof planAnchorOffsetPx === "number" && Number.isFinite(planAnchorOffsetPx) ? planAnchorOffsetPx : 0;
            restoreSnapshot = {
              stickToBottom: false,
              scrollTop: Math.max(0, anchorTop - offset),
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
   * P3 — 진입 완료(settled + 첫 anchor 적용) 뒤의 프로그램 스크롤·레이아웃 변화만 읽기 상태를 다시 맞춘다.
   * 진입 단계(E1·E2: 첫 안 읽음·구분선·진입 미읽음 캡처)는 건드리지 않는다.
   */
  const scheduleReaderStateSyncAfterEntry = useCallback(() => {
    if (!engine.isSettled() || !hasAppliedInitialAnchorRef.current) return;
    scheduleMessengerRoomReaderStateSync({
      viewport: messagesViewportRef.current,
      stickToBottomRef,
      roomId,
      activeSheet,
    });
  }, [activeSheet, engine, messagesViewportRef, roomId, stickToBottomRef]);

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
      /** S2 — 레이아웃 보정 뒤 읽기 상태 동기화(진입 완료 뒤만) */
      scheduleReaderStateSyncAfterEntry();
    },
    [
      buildCtx,
      completeEntryPhase,
      engine,
      loadingOlderMessages,
      markCmScrollRun,
      messageCount,
      persistScrollPosition,
      scheduleReaderStateSyncAfterEntry,
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

      if (force && reason === "fab_jump_latest") {
        /** ↓ 버튼 — 부드럽게 맨 아래까지(매 프레임 하단 재계산). */
        const reader = useMessengerRoomReaderStateStore.getState();
        stickToBottomRef.current = true;
        reader.setScrollPosition(roomId, "at-bottom");
        const started = engine.animateScrollToBottom(buildCtx(), {
          onDone: () => {
            stickToBottomRef.current = engine.readStickToBottom();
            /** S5 — 도착한 실제 위치로 읽기 상태 동기화 */
            syncMessengerRoomReaderStateFromViewport({
              viewport: messagesViewportRef.current,
              stickToBottomRef,
              roomId,
              activeSheet,
            });
          },
        });
        if (!started) engine.scrollToBottomExplicit(buildCtx());
        markCmScrollRun(reason, "explicit");
        return;
      }

      if (force) {
        engine.scrollToBottomExplicit(buildCtx());
        stickToBottomRef.current = true;
        const tip = roomMessages[roomMessages.length - 1]?.id?.trim() || null;
        const reader = useMessengerRoomReaderStateStore.getState();
        reader.setScrollPosition(roomId, "at-bottom");
        if (tip) reader.setLastVisibleMessageId(roomId, tip);
        markCmScrollRun(reason, reason === "own_message_append" ? "self_send_follow" : "explicit");
        return;
      }

      engine.notifyAppend(buildCtx());
      if (engine.readStickToBottom()) {
        markCmScrollRun(reason, "realtime_follow");
      }
      /** S3 — 자동 따라가기 뒤 읽기 상태(「↓」) 를 실제 위치로. scrollTop 이 안 바뀌어 scroll 이벤트가 없어도 맞춘다 */
      scheduleReaderStateSyncAfterEntry();
    },
    [
      activeSheet,
      applyLayoutPreserve,
      buildCtx,
      engine,
      markCmScrollRun,
      messageCount,
      messagesViewportRef,
      roomId,
      roomMessages,
      scheduleReaderStateSyncAfterEntry,
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

  const scrollMessengerToMessage = useCallback(
    (messageId: string, scrollOpts?: { align?: ScrollToMessageAlign; animate?: boolean }): boolean => {
      const mid = messageId.trim();
      if (!mid) return false;
      /** Index must match virtualizer count (`displayRoomMessages`), not raw seed list. */
      const index = roomMessages.findIndex((message) => String(message.id ?? "").trim() === mid);
      if (index < 0 || index >= messageCount) return false;
      const align = scrollOpts?.align ?? "center";
      const ctx = buildCtx();

      if (scrollOpts?.animate) {
        /** ↓ 버튼(첫 안 읽음) — 실제 DOM 위치로 부드럽게 이동(추정 높이 미사용). */
        const vpA = messagesViewportRef.current;
        const rowA =
          typeof document !== "undefined"
            ? (document.getElementById(`cm-room-msg-${mid}`) as HTMLElement | null)
            : null;
        if (vpA && rowA && vpA.contains(rowA)) {
          stickToBottomRef.current = false;
          const reader = useMessengerRoomReaderStateStore.getState();
          reader.setScrollPosition(roomId, "reading-history");
          reader.setLastVisibleMessageId(roomId, mid);
          engine.animateScrollToElement(ctx, rowA, align, {
            topInsetPx: MESSENGER_JUMP_TO_MESSAGE_TOP_INSET_PX,
            onDone: () => {
              stickToBottomRef.current = engine.readStickToBottom();
              /**
               * F2-② (설계 2026-11-18 PR-1): 이동 중 scroll 이벤트는 버려지므로(`engine.isAnimating()`) 도착한 실제 위치로
               * 위치·lastVisible 을 함께 동기화한다(예전엔 lastVisible 만 → 맨 아래 도착해도 「읽는 중」 고착).
               */
              syncMessengerRoomReaderStateFromViewport({
                viewport: messagesViewportRef.current,
                stickToBottomRef: { current: stickToBottomRef.current },
                roomId,
                activeSheet,
              });
            },
          });
          return true;
        }
      }
      /** Empty stub reports size 0 — do not treat no-op scrollToIndex as success. */
      const virtualizerReady =
        messageCount > 0 && (ctx.virtualizer?.getTotalSize?.() ?? 0) > 0 && Boolean(ctx.virtualizer?.scrollToIndex);
      let applied = virtualizerReady ? engine.scrollToIndexExplicit(ctx, index, align) : false;

      const vp = messagesViewportRef.current;
      const row =
        typeof document !== "undefined"
          ? (document.getElementById(`cm-room-msg-${mid}`) as HTMLElement | null)
          : null;
      if (vp && row && vp.contains(row)) {
        const vpRect = vp.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const inView =
          rowRect.bottom > vpRect.top + 8 && rowRect.top < vpRect.bottom - 8;
        if (!inView || !applied) {
          engine.scrollToElementExplicit(ctx, row, align);
          applied = true;
        }
      } else if (virtualizerReady && applied) {
        /** Row not mounted yet — virtualizer jump still owns the scroll; keep applied. */
      }

      if (applied) {
        stickToBottomRef.current = false;
        const reader = useMessengerRoomReaderStateStore.getState();
        reader.setScrollPosition(roomId, "reading-history");
        /** FAB math must advance immediately — do not wait for a user scroll event. */
        reader.setLastVisibleMessageId(roomId, mid);
        /** F2-② 애니메이션 없는 이동 끝 — 레이아웃 뒤 실제 위치로 위치·lastVisible 동기화 */
        window.requestAnimationFrame(() => {
          syncMessengerRoomReaderStateFromViewport({
            viewport: messagesViewportRef.current,
            stickToBottomRef: { current: stickToBottomRef.current },
            roomId,
            activeSheet,
          });
        });
      }
      return applied;
    },
    [activeSheet, buildCtx, engine, messageCount, messagesViewportRef, roomId, roomMessages, stickToBottomRef]
  );

  const updateStickToBottomFromScroll = useCallback(() => {
    /** 부드러운 이동 중 발생한 scroll 이벤트는 사용자 스크롤이 아니다 — 끝나면 onDone 이 상태를 맞춘다. */
    if (engine.isAnimating()) return;
    engine.notifyUserScroll(buildCtx());
    stickToBottomRef.current = engine.readStickToBottom();
    /** S1 — 「↓」·읽기 상태 SSOT 1회 (scrollPosition·stick·lastVisible) */
    syncMessengerRoomReaderStateFromViewport({
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
    return () => {
      /** P3 — 떠나는 방의 예약된 읽기 상태 동기화 취소 */
      if (rid) cancelMessengerRoomReaderStateSync(rid);
    };
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
    const newest = roomMessages.length > 0 ? roomMessages[roomMessages.length - 1] : null;
    const tipMessageId = newest?.id?.trim() || null;
    const tipEntryConsumed = Boolean(
      rid && tipMessageId && isMessengerRoomTimelineTipEntryConsumed(rid, tipMessageId)
    );
    const newestPeerGiftCertificate =
      newest?.messageType === "gift_certificate" && newest.isMine !== true;
    /**
     * D4 (Owner 「D4 진행」 2026-11-09): 「뒤로 돌아옴」이고 보던 메시지가 지금 그려진 목록에 있으면 그 위치로.
     * 판정은 방 첫 그림 때 1번(`decideMessengerRoomReturnEntry`) — 여기서 읽고 지운다.
     */
    const persistedForReturn = rid ? peekMessengerRoomScrollPosition(rid) : null;
    const returnAnchorId =
      persistedForReturn && !persistedForReturn.stickToBottom
        ? persistedForReturn.firstVisibleMessageId?.trim() || ""
        : "";
    const entryViewport = messagesViewportRef.current;
    const returnRestore =
      rid &&
      returnAnchorId &&
      entryIntentRef.current !== "push" &&
      peekMessengerRoomReturnEntry(rid) &&
      entryViewport &&
      resolveScrollTopForAnchorMessage(entryViewport, returnAnchorId) != null
        ? { anchorMessageId: returnAnchorId, anchorOffsetPx: persistedForReturn?.anchorOffsetPx ?? null }
        : null;
    if (rid) clearMessengerRoomReturnEntry(rid);
    const plan = resolveMessengerRoomEntryScrollPlan({
      intent: entryIntentRef.current,
      returnRestore,
      hasPersisted,
      unreadCount: effectiveUnread,
      lastReadMessageId,
      firstUnreadMessageId,
      newestPeerGiftCertificate,
      tipEntryConsumed,
    });
    if (plan.clearPersist && rid) clearMessengerRoomScrollPosition(rid);
    if (plan.forceBottom) stickToBottomRef.current = true;

    entryScrollScheduledRef.current = true;
    notifyEntryFromPlan(plan.reason, plan.forceBottom, plan.anchorMessageId ?? null, plan.anchorOffsetPx ?? null);
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

  /**
   * 새 메시지 따라가기 — P3: paint 전(useLayoutEffect). 새 행이 화면 밖인 프레임이 한 번 그려진 뒤 움직이는
   * 「튐」·「↓ 가 메시지보다 먼저 뜸」을 없앤다(계약: paint 후 correct 금지).
   */
  useLayoutEffect(() => {
    const last = roomMessages[roomMessages.length - 1];
    const tailChanged = Boolean(last?.id) && last?.id !== prevTailMessageIdRef.current;
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
    /**
     * F2-③ (설계 2026-11-18 PR-1): 새 끝 메시지가 병합되면(따라가기 여부와 무관) 레이아웃 뒤 viewport 동기화(S3)를
     * 반드시 거친다 — 위쪽을 읽는 중 수신·따라가기 안 한 수신에서도 위치·lastVisible 이 실제와 맞는다(같은 프레임 1회로 합쳐짐).
     */
    /**
     * 내 글 전송(force) 경로는 제외 — 그 경로는 맨 아래·끝 id 를 바로 쓰고, 큰 행의 높이가 나중에 정해지면
     * 레이아웃 보정(ResizeObserver → applyLayoutPreserve → 엔진 stick 유지 후 S2 동기화)이 정착 뒤에 맞춘다.
     * 여기서 rAF 동기화를 더하면 높이 정착 전 viewport 를 읽어 「↓」가 잠깐 뜰 수 있다(PR-1 검토 #7).
     */
    const ownForceFollow = decision.scroll && decision.reason === "own_message_append";
    if (tailChanged && !ownForceFollow) scheduleReaderStateSyncAfterEntry();
    if (last?.id) {
      prevTailMessageIdRef.current = last.id;
      prevTailClientMessageIdRef.current = last.clientMessageId ?? null;
    }
  }, [engine, roomMessages, scheduleReaderStateSyncAfterEntry, scrollMessengerToBottom]);

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
    /** S4 */
    scheduleReaderStateSyncAfterEntry();
  }, [buildCtx, engine, loadingOlderMessages, roomMessages, scheduleReaderStateSyncAfterEntry]);

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

    /**
     * 내용 높이 변화(사진·미리보기 로드 등으로 행이 늦게 커짐) — 스크롤 창 크기는 그대로라 위 observer 로는 못 잡는다.
     * 하단 고정(stick) 상태일 때만 맨 아래를 다시 맞춘다. 과거 읽는 중(stick=false)이면 손대지 않는다
     * (뷰포트 위 행의 크기 변화는 virtualizer 가 스크롤을 보정한다).
     */
    const onContentResize = () => {
      if (loadingOlderMessages) return;
      if (engine.getPhase() !== "settled" || !engine.readStickToBottom()) return;
      applyLayoutPreserve("content_resize_keep_bottom");
    };
    const roContent = new ResizeObserver(onContentResize);
    const observeContentChildren = () => {
      for (const child of Array.from(el.children)) roContent.observe(child);
    };
    observeContentChildren();
    const moContent =
      typeof MutationObserver !== "undefined" ? new MutationObserver(observeContentChildren) : null;
    moContent?.observe(el, { childList: true });

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
      roContent.disconnect();
      moContent?.disconnect();
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onLayoutViewport);
      window.removeEventListener("orientationchange", onLayoutViewport);
    };
  }, [applyLayoutPreserve, engine, loadingOlderMessages, messagesViewportRef, tryCompleteEntry]);

  /**
   * D5-R3 (Owner 「D5 구현」 2026-11-09): 「방을 나갈 때」 정리는 방이 바뀌거나 화면에서 내려갈 때만 한다.
   * 이전에는 deps 에 roomMessages·persistScrollPosition 이 있어 메시지가 바뀔 때마다(방 안에 있는 동안) 실행돼,
   * 돌아온 직후 저장 위치를 지우거나 위치 적용 전 값(scrollTop 0)으로 덮어썼다(운영 실측).
   * 최신 값은 ref 로 읽는다.
   */
  const leaveRoomMessagesRef = useRef(roomMessages);
  leaveRoomMessagesRef.current = roomMessages;
  const leavePersistRef = useRef(persistScrollPosition);
  leavePersistRef.current = persistScrollPosition;
  useEffect(() => {
    return () => {
      const rid = roomId.trim();
      if (!rid) return;
      const leavingMessages = leaveRoomMessagesRef.current;
      /**
       * Leave-at-latest: consume tip + drop mid-unread persist so same-room re-entry
       * lands on latest (gift tip visible). History reading (stick false) keeps persist.
       */
      if (stickToBottomRef.current) {
        const tip = leavingMessages[leavingMessages.length - 1]?.id?.trim();
        if (tip) markMessengerRoomTimelineTipEntryConsumed(rid, tip);
        clearMessengerRoomScrollPosition(rid);
        return;
      }
      leavePersistRef.current();
      /** D4: 읽던 중 나감 — 돌아오면 같은 메시지가 첫 그림에 있도록 불러와 있던 메시지 보관 */
      saveMessengerRoomReturnHistory(rid, leavingMessages);
    };
  }, [roomId, stickToBottomRef]);

  return {
    scrollMessengerToBottom,
    scrollMessengerToMessage,
    updateStickToBottomFromScroll,
    persistScrollPosition,
    enqueueScrollAnchor,
  };
}
