"use client";

import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { runMessengerRoomScrollToBottom } from "@/lib/community-messenger/room/messenger-room-scroll-to-bottom";

type VirtualizerLike = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;

/**
 * 배달·매장 주문 chrome(`data-store-order-delivery-chrome`) 높이 변화·최초 부착 시
 * 타임라인을 composer 바로 위(최신 메시지)로 맞춘다. 거래 도크 앵커와 동일 패턴.
 */
export function useMessengerRoomStoreOrderDockScrollAnchor(opts: {
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
      if (prev === 0) return;
      if (grew) {
        anchorTimeline(true);
      } else {
        anchorTimeline(false);
      }
    };

    const bindDock = () => {
      const vp = messagesViewportRef.current;
      const shell = vp?.closest("[data-messenger-shell]");
      const next = shell?.querySelector<HTMLElement>("[data-store-order-delivery-chrome]") ?? null;
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
      const h0 = Math.round(dockEl.getBoundingClientRect().height);
      lastDockHeightRef.current = h0;
    };

    bindDock();

    const vp = messagesViewportRef.current;
    const shellObserver =
      vp && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            bindDock();
          })
        : null;
    const shell = vp?.closest("[data-messenger-shell]");
    if (shell && shellObserver) {
      shellObserver.observe(shell, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(rafId);
      dockObserver?.disconnect();
      shellObserver?.disconnect();
      dockEl = null;
      lastDockHeightRef.current = 0;
    };
  }, [enabled, messageEndRef, messagesViewportRef, stickToBottomRef, virtualizer]);
}
