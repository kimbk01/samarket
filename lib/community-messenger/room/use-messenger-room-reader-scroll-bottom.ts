"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { MessengerChatViewPosition } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
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
    | "stickers";
  stickToBottomRef: MutableRefObject<boolean>;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
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
      if (id && messengerRolloutUsesRoomScrollHints()) {
        useMessengerRoomReaderStateStore.getState().clearPendingNew(id);
        useMessengerRoomReaderStateStore.getState().setScrollPosition(id, "at-bottom");
      }
      const reason = opts?.reason ?? "explicit";
      /** 한 프레임 1회 rAF — 이중 rAF 는 동일 16ms 예산에서 레이아웃 읽기·쓰기를 늘린다. */
      window.requestAnimationFrame(() => {
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
      });
    },
    [roomId, syncScrollGeomFromViewport]
  );

  const updateStickToBottomFromScroll = useCallback(() => {
    const el = messagesViewportRef.current;
    if (!el) return;
    const threshold = MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX;
    const sh = el.scrollHeight;
    const st = el.scrollTop;
    const ch = el.clientHeight;
    const dist = sh - st - ch;
    stickToBottomRef.current = dist < threshold;
    lastScrollGeomRef.current = {
      sh,
      st,
      ch,
      ready: true,
    };
    const id = roomId?.trim();
    if (!id || !messengerRolloutUsesRoomScrollHints()) return;
    let pos: MessengerChatViewPosition;
    if (activeSheet === "search") {
      pos = "jumped-by-search";
    } else if (stickToBottomRef.current) {
      pos = "at-bottom";
    } else {
      pos = "reading-history";
    }
    useMessengerRoomReaderStateStore.getState().setScrollPosition(id, pos);
  }, [roomId, activeSheet]);

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

  useEffect(() => {
    const last = roomMessages[roomMessages.length - 1];
    const isMine = Boolean(last?.isMine);
    if (isMine) {
      scrollMessengerToBottom({ reason: "own_message_append" });
      return;
    }
    if (stickToBottomRef.current) {
      scrollMessengerToBottom({ reason: "messages_changed_auto" });
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
        const distFromBottom = prev.sh - prev.st - prev.ch;
        const stBefore = box.scrollTop;
        const sh = box.scrollHeight;
        const ch = box.clientHeight;
        const maxScroll = Math.max(0, sh - ch);
        if (stickToBottomRef.current) {
          box.scrollTop = maxScroll;
        } else {
          const target = maxScroll - distFromBottom;
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
            bottom_distance_px: Math.round(distFromBottom),
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
  }, [roomId, syncScrollGeomFromViewport, messagesViewportRef]);

  return { scrollMessengerToBottom, updateStickToBottomFromScroll };
}
