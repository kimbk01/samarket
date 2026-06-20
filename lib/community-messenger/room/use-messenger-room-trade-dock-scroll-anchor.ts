"use client";

import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import {
  CM_TRADE_DOCK_LAYOUT_EVENT,
  notifyCmTradeDockLayoutChange,
} from "@/lib/community-messenger/room/cm-trade-dock-layout";
import { syncMessengerRoomStickToBottomFromViewport } from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import type { CmScrollOwnerReason } from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";

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

export function useMessengerRoomTradeDockScrollAnchor(opts: {
  enabled: boolean;
  roomId?: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  messageCount: number;
  stickToBottomRef: MutableRefObject<boolean>;
  scrollMessengerToBottomRef: MutableRefObject<
    (req?: { reason?: CmScrollOwnerReason; force?: boolean }) => void
  >;
}): void {
  const {
    enabled,
    roomId,
    messagesViewportRef,
    messageEndRef,
    stickToBottomRef,
    scrollMessengerToBottomRef,
  } = opts;

  void messageEndRef;
  void opts.messageCount;

  const lastDockHeightRef = useRef(0);

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
        scrollMessengerToBottomRef.current({ reason: "virtualizer_scroll_anchor" });
        markCmR9ScrollAnchor(roomId ?? "", "scrollAnchorRestoreEndMs");
      });
    };

    const onDockResize = (height: number) => {
      const prev = lastDockHeightRef.current;
      lastDockHeightRef.current = height;
      if (height > prev + 4 || prev === 0) anchorTimeline();
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
        onDockResize(Math.round(entry.contentRect.height));
      });
      dockObserver.observe(dockEl);
      onDockResize(Math.round(dockEl.getBoundingClientRect().height));
    };

    const onLayoutEvent = () => {
      bindDock();
      anchorTimeline();
    };

    bindDock();
    anchorTimeline();

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

    window.addEventListener(CM_TRADE_DOCK_LAYOUT_EVENT, onLayoutEvent);

    return () => {
      cancelAnimationFrame(rafId);
      dockObserver?.disconnect();
      shellObserver?.disconnect();
      window.removeEventListener(CM_TRADE_DOCK_LAYOUT_EVENT, onLayoutEvent);
      dockEl = null;
      lastDockHeightRef.current = 0;
    };
  }, [enabled, messagesViewportRef, roomId, scrollMessengerToBottomRef, stickToBottomRef]);
}

export { notifyCmTradeDockLayoutChange };
