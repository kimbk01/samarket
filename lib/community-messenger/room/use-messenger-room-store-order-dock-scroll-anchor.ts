"use client";

import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { runMessengerRoomScrollToBottom } from "@/lib/community-messenger/room/messenger-room-scroll-to-bottom";
import { syncMessengerRoomStickToBottomFromViewport } from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";

type VirtualizerLike = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;

function nowFromT0Ms(): number | null {
  const t0 = entryTimingT0();
  if (t0 <= 0 || typeof performance === "undefined") return null;
  return Math.round(performance.now() - t0);
}

function markCmR9ScrollAnchor(roomId: string, key: "scrollAnchorRestoreBeginMs" | "scrollAnchorRestoreEndMs"): void {
  if (typeof window === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const bag = (window as Window & { __cmR9UpgradeStateByRoom?: Record<string, Record<string, unknown>> })
    .__cmR9UpgradeStateByRoom;
  const st = bag?.[id];
  if (!st || !st.active) return;
  if (st.scrollAnchorDeferred === true) return;
  st[key] = nowFromT0Ms();
}

/**
 * 배달·매장 주문 chrome(`data-store-order-delivery-chrome`) 높이 변화·최초 부착 시
 * 타임라인을 composer 바로 위(최신 메시지)로 맞춘다. 거래 도크 앵커와 동일 패턴.
 */
export function useMessengerRoomStoreOrderDockScrollAnchor(opts: {
  enabled: boolean;
  roomId?: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  virtualizer: VirtualizerLike;
  messageCount: number;
  stickToBottomRef: MutableRefObject<boolean>;
}): void {
  const {
    enabled,
    roomId,
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

    const anchorTimeline = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const nearBottom = syncMessengerRoomStickToBottomFromViewport({
          viewport: messagesViewportRef.current,
          stickToBottomRef,
          roomId: roomId ?? "",
        });
        if (!nearBottom) return;
        const upgradeBag = (window as Window & {
          __cmR9UpgradeStateByRoom?: Record<string, { scrollAnchorDeferred?: boolean }>;
        }).__cmR9UpgradeStateByRoom;
        if (upgradeBag?.[roomId?.trim() ?? ""]?.scrollAnchorDeferred) return;
        markCmR9ScrollAnchor(roomId ?? "", "scrollAnchorRestoreBeginMs");
        runMessengerRoomScrollToBottom({
          messagesViewportRef,
          messageEndRef,
          virtualizer,
          messageCount: messageCountRef.current,
          stickToBottomRef,
        });
        markCmR9ScrollAnchor(roomId ?? "", "scrollAnchorRestoreEndMs");
      });
    };

    const onDockResize = (height: number) => {
      const prev = lastDockHeightRef.current;
      lastDockHeightRef.current = height;
      if (prev === 0) return;
      if (height > prev + 4) {
        anchorTimeline();
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
  }, [enabled, messageEndRef, messagesViewportRef, roomId, stickToBottomRef, virtualizer]);
}
