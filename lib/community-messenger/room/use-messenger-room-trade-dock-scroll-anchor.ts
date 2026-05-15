"use client";

import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import {
  CM_TRADE_DOCK_LAYOUT_EVENT,
  notifyCmTradeDockLayoutChange,
} from "@/lib/community-messenger/room/cm-trade-dock-layout";
import { runMessengerRoomScrollToBottom } from "@/lib/community-messenger/room/messenger-room-scroll-to-bottom";

type VirtualizerLike = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;

/**
 * 거래 도크 높이 증가(펼침·상품 카드·비동기 로드) 시 마지막 메시지를 도크 상단에 고정한다.
 * 도크가 커질 때는 stick-to-bottom 여부와 무관하게 스크롤한다(새로 가려지는 구간 방지).
 */
export function useMessengerRoomTradeDockScrollAnchor(opts: {
  enabled: boolean;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  virtualizer: VirtualizerLike;
  messageCount: number;
  stickToBottomRef: MutableRefObject<boolean>;
}): void {
  const {
    enabled,
    messagesViewportRef,
    messageEndRef,
    virtualizer,
    messageCount,
    stickToBottomRef,
  } = opts;

  const lastDockHeightRef = useRef(0);
  const messageCountRef = useRef(messageCount);
  messageCountRef.current = messageCount;

  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    let dockObserver: ResizeObserver | null = null;
    let dockEl: HTMLElement | null = null;

    const anchorTimeline = (force: boolean) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const nearBottom = stickToBottomRef.current;
        if (!force && !nearBottom) return;
        runMessengerRoomScrollToBottom({
          messagesViewportRef,
          messageEndRef,
          virtualizer,
          messageCount: messageCountRef.current,
          stickToBottomRef,
        });
      });
    };

    const onDockResize = (height: number) => {
      const prev = lastDockHeightRef.current;
      const grew = height > prev + 4;
      lastDockHeightRef.current = height;
      if (grew || prev === 0) {
        anchorTimeline(true);
      } else {
        anchorTimeline(false);
      }
    };

    const bindDock = () => {
      const vp = messagesViewportRef.current;
      const shell = vp?.closest("[data-messenger-shell]");
      const next = shell?.querySelector<HTMLElement>("[data-cm-trade-dock]") ?? null;
      if (next === dockEl) return;
      dockObserver?.disconnect();
      dockEl = next;
      lastDockHeightRef.current = 0;
      if (!dockEl) return;

      dockObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const h = Math.round(entry.contentRect.height);
        onDockResize(h);
      });
      dockObserver.observe(dockEl);
      onDockResize(Math.round(dockEl.getBoundingClientRect().height));
    };

    const onLayoutEvent = () => {
      bindDock();
      anchorTimeline(true);
    };

    bindDock();
    anchorTimeline(true);

    const vp = messagesViewportRef.current;
    const shellObserver =
      vp && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            bindDock();
            anchorTimeline(true);
          })
        : null;
    const shell = vp?.closest("[data-messenger-shell]");
    if (shell && shellObserver) {
      shellObserver.observe(shell, { childList: true, subtree: true });
    }

    window.addEventListener(CM_TRADE_DOCK_LAYOUT_EVENT, onLayoutEvent);

    return () => {
      cancelAnimationFrame(rafId);
      dockObserver?.disconnect();
      shellObserver?.disconnect();
      window.removeEventListener(CM_TRADE_DOCK_LAYOUT_EVENT, onLayoutEvent);
      dockEl = null;
      lastDockHeightRef.current = 0;
    };
  }, [
    enabled,
    messageEndRef,
    messagesViewportRef,
    stickToBottomRef,
    virtualizer,
  ]);
}

export { notifyCmTradeDockLayoutChange };
