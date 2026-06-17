"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { messengerRoomTracksScrollPosition } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";
import {
  cmPolishAnalysisEnabled,
  consumeCmPolishSendClickToBubble,
  disposeCmPolishImageLayoutShiftObserver,
  ensureCmPolishImageLayoutShiftObserver,
  logCmPolishAnalysis,
  resetCmPolishAnalysisSession,
} from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import {
  cmScrollAnalysisEnabled,
  disposeCmScrollLayoutShiftObserver,
  ensureCmScrollLayoutShiftObserver,
  getCmScrollLayoutShiftCount,
  logCmScrollAnalysis,
  resetCmScrollAnalysisSession,
} from "@/lib/community-messenger/monitoring/cm-scroll-analysis";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import { scheduleMessengerScrollToBottomAfterRowsPainted } from "@/lib/community-messenger/room/messenger-timeline-layout-mode";
import { isMessengerRoomNearBottomFromMetrics } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import { logChatRoomScroll } from "@/lib/community-messenger/room/messenger-room-timeline-log";
import {
  clearMessengerRoomPendingNewWithChipLog,
  resolveMessengerRoomNearBottomForAutoScroll,
  syncMessengerRoomStickToBottomFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";

/**
 * @see docs/community-messenger-mobile-room-viewport.md
 *
 * 하단 스크롤·stickToBottom·reader store 위치 힌트.
 * `useMessengerRoomClientPhase1` 의 scrollMessengerToBottom / updateStickToBottomFromScroll / 관련 effect 본문·deps 그대로.
 */
export function useMessengerRoomReaderScrollBottom({
  roomId,
  activeSheet,
  stickToBottomRef,
  messagesViewportRef,
  messageEndRef,
  roomMessages,
  /** 배달·주문 direct 타임라인이 진입 스크롤 소유 — room_entry_initial 중복 방지 */
  deferEntryScrollToDeliveryDirectTimeline = false,
}: {
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
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  deferEntryScrollToDeliveryDirectTimeline?: boolean;
}): {
  scrollMessengerToBottom: (opts?: { reason?: string }) => void;
  updateStickToBottomFromScroll: () => void;
} {
  /** 키보드·도크로 스크롤 박스 높이만 바뀔 때 하단 거리(px) 보존용 스냅샷 */
  const lastScrollGeomRef = useRef<{ sh: number; st: number; ch: number; ready: boolean }>({
    sh: 0,
    st: 0,
    ch: 0,
    ready: false,
  });

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

  const scrollMessengerToBottom = useCallback(
    (opts?: { reason?: string }) => {
      const id = roomId?.trim();
      const reason = opts?.reason ?? "explicit";
      const alwaysScroll = reason === "own_message_append" || reason === "explicit";
      if (!alwaysScroll) {
        const nearBottom = resolveMessengerRoomNearBottomForAutoScroll({
          viewport: messagesViewportRef.current,
          stickToBottomRef,
          roomId,
          activeSheet,
          lastScrollGeomRef,
        });
        if (!nearBottom) {
          if (id) {
            logChatRoomScroll("auto_stick_skipped_user_scrolled_up", {
              roomIdSuffix: id.length > 8 ? id.slice(-8) : id,
              reason,
            });
          }
          return;
        }
      }
      if (id && messengerRoomTracksScrollPosition()) {
        clearMessengerRoomPendingNewWithChipLog({ roomId: id, reason: "jump_to_latest" });
        useMessengerRoomReaderStateStore.getState().setScrollPosition(id, "at-bottom");
      }
      const runScroll = () => {
        if (!alwaysScroll) {
          const nearBottomNow = resolveMessengerRoomNearBottomForAutoScroll({
            viewport: messagesViewportRef.current,
            stickToBottomRef,
            roomId,
            activeSheet,
            lastScrollGeomRef,
          });
          if (!nearBottomNow) {
            if (id) {
              logChatRoomScroll("auto_stick_skipped_user_scrolled_up", {
                roomIdSuffix: id.length > 8 ? id.slice(-8) : id,
                reason: `${reason}_deferred`,
              });
            }
            return;
          }
        }
        const vp = messagesViewportRef.current;
        let bottomDist = 0;
        let jumpPx: number | null = null;
        if (vp) {
          const sh0 = vp.scrollHeight;
          const st0 = vp.scrollTop;
          const ch0 = vp.clientHeight;
          bottomDist = Math.max(0, sh0 - st0 - ch0);
          const t0 = typeof performance !== "undefined" ? performance.now() : 0;
          const sh = vp.scrollHeight;
          vp.scrollTop = sh;
          const st1 = vp.scrollTop;
          jumpPx = Math.abs(st1 - st0);
          const adjustMs =
            typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
        if (cmScrollAnalysisEnabled()) {
          logCmScrollAnalysis({
            append_scroll_adjust_ms: adjustMs,
            layout_shift_after_append: getCmScrollLayoutShiftCount(),
            bottom_distance_px: Math.round(bottomDist),
            auto_scroll_triggered: true,
            auto_scroll_reason: reason,
            visible_window_jump_px: jumpPx,
            room_id_suffix: id && id.length > 8 ? id.slice(-8) : id,
          });
        }
        if (reason === "room_entry_initial") {
          logChatRoomScroll("initial_anchor_bottom", {
            roomIdSuffix: id && id.length > 8 ? id.slice(-8) : id,
            bottomDistancePx: Math.round(bottomDist),
            reason,
          });
        }
        } else if (cmScrollAnalysisEnabled()) {
          logCmScrollAnalysis({
            append_scroll_adjust_ms: null,
            bottom_distance_px: null,
            auto_scroll_triggered: true,
            auto_scroll_reason: reason,
            room_id_suffix: id && id.length > 8 ? id.slice(-8) : id,
          });
        }
        if (cmPolishAnalysisEnabled() && reason === "own_message_append") {
          consumeCmPolishSendClickToBubble(jumpPx);
        }
        messageEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
        syncScrollGeomFromViewport();
        syncMessengerRoomStickToBottomFromViewport({
          viewport: messagesViewportRef.current,
          stickToBottomRef,
          roomId,
          activeSheet,
        });
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(runScroll));
      } else {
        runScroll();
      }
    },
    [roomId, activeSheet, messageEndRef, messagesViewportRef, stickToBottomRef, syncScrollGeomFromViewport]
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
  }, [roomId, activeSheet, messagesViewportRef, stickToBottomRef]);

  useLayoutEffect(() => {
    if (cmScrollAnalysisEnabled()) {
      resetCmScrollAnalysisSession();
      disposeCmScrollLayoutShiftObserver();
      ensureCmScrollLayoutShiftObserver();
    }
    if (cmPolishAnalysisEnabled()) {
      resetCmPolishAnalysisSession();
      disposeCmPolishImageLayoutShiftObserver();
      ensureCmPolishImageLayoutShiftObserver();
    }
    stickToBottomRef.current = true;
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
  }, [roomId]);

  /** prepend(과거) vs append(신규) — tail id 불변 시 auto scroll 생략(대량 방 깜빡임) */
  const prevTailMessageIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    prevTailMessageIdRef.current = null;
  }, [roomId]);

  /** 방당 최초 타임라인 paint 1회만 — append 마다 room_entry_initial 재스케줄 금지 */
  const initialEntryScrollDoneRef = useRef(false);

  useLayoutEffect(() => {
    initialEntryScrollDoneRef.current = false;
  }, [roomId]);

  /** 방 진입(일반·거래 virtualized): 말풍선 DOM 후 스크롤. 배달·주문은 timeline_delivery_direct_paint 가 소유. */
  useLayoutEffect(() => {
    if (deferEntryScrollToDeliveryDirectTimeline || roomMessages.length <= 0) return;
    if (initialEntryScrollDoneRef.current) return;
    initialEntryScrollDoneRef.current = true;
    return scheduleMessengerScrollToBottomAfterRowsPainted({
      roomId,
      messagesViewportRef,
      scroll: scrollMessengerToBottom,
      reason: "room_entry_initial",
      stickToBottomRef,
    });
  }, [
    deferEntryScrollToDeliveryDirectTimeline,
    roomId,
    roomMessages.length,
    scrollMessengerToBottom,
    messagesViewportRef,
    stickToBottomRef,
  ]);

  useEffect(() => {
    const last = roomMessages[roomMessages.length - 1];
    const decision = resolveMessengerRoomMessagesAutoScroll({
      previousTailMessageId: prevTailMessageIdRef.current,
      currentTailMessageId: last?.id ?? null,
      currentTailIsMine: Boolean(last?.isMine),
    });
    if (decision.scroll) {
      scrollMessengerToBottom({ reason: decision.reason });
    }
    if (last?.id) {
      prevTailMessageIdRef.current = last.id;
    }
  }, [roomMessages, scrollMessengerToBottom]);

  /**
   * 키보드·거래 도크 등으로 스크롤 컨테이너 높이만 변할 때:
   * - 과거 스크롤 중이면 **하단까지의 거리**를 유지해 같은 메시지가 보이게 한다.
   * - 하단 근처이면 최신 쪽으로 맞춘다.
   */
  useLayoutEffect(() => {
    const el = messagesViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const restoreScrollAfterChromeChange = () => {
      cancelAnimationFrame(rafId);
      /** ResizeObserver·vv 콜백당 스케줄 1회 rAF 로 레이아웃 스래시 완화 */
      rafId = requestAnimationFrame(() => {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
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
          if (viewportShrunk && wasNearBottom) {
            stickToBottomRef.current = true;
          }
          box.scrollTop = maxScroll;
          logChatRoomScroll("keyboard_resize_anchor_keep", {
            roomIdSuffix: roomId.trim().length > 8 ? roomId.trim().slice(-8) : roomId.trim(),
            viewportShrunk,
            stickToBottom: stickToBottomRef.current,
            bottomDistancePx: Math.round(liveDistFromBottom),
          });
        } else {
          const target = maxScroll - liveDistFromBottom;
          box.scrollTop = Math.max(0, Math.min(maxScroll, target));
        }
        const stAfter = box.scrollTop;
        const keyboardMs =
          typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
        if (cmScrollAnalysisEnabled()) {
          logCmScrollAnalysis({
            keyboard_viewport_shift_ms: keyboardMs,
            visible_window_jump_px: Math.round(Math.abs(stAfter - stBefore)),
            auto_scroll_triggered: false,
            auto_scroll_reason: "viewport_resize_restore",
            bottom_distance_px: Math.round(liveDistFromBottom),
            room_id_suffix: roomId.trim().length > 8 ? roomId.trim().slice(-8) : roomId.trim(),
          });
        }
        if (cmPolishAnalysisEnabled()) {
          logCmPolishAnalysis({
            keyboard_open_adjust_ms: keyboardMs,
            message_append_jump_px: Math.round(Math.abs(stAfter - stBefore)),
            room_id_suffix: roomId.trim().length > 8 ? roomId.trim().slice(-8) : roomId.trim(),
          });
        }
        syncScrollGeomFromViewport();
      });
    };

    const ro = new ResizeObserver(() => {
      restoreScrollAfterChromeChange();
    });
    ro.observe(el);

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    /**
     * - visualViewport: iOS·주소창·키보드
     * - window resize / orientation: Android Chrome 주소창·멀티윈도·WebView 이 RO·vv 보다 늦는 경우
     * 모두 동일 rAF로 합쳐 중복 스크롤 보정을 막는다.
     */
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
  }, [roomId, activeSheet, syncScrollGeomFromViewport, messagesViewportRef, stickToBottomRef]);

  return { scrollMessengerToBottom, updateStickToBottomFromScroll };
}
