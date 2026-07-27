"use client";

import { useEffect, type RefObject } from "react";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import {
  buildCmRoomVisibleViewportSnapshot,
  CM_ROOM_CHROME_HEIGHT_SYNC_EVENT,
  CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX,
  resolveCmRoomComposerBottomPaddingPx,
  resolveCmRoomTimelineHeightPx,
} from "@/lib/ui/cm-room-visible-viewport-contract";

export { CM_ROOM_CHROME_HEIGHT_SYNC_EVENT };

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

declare global {
  interface Window {
    /** Explicit opt-in for CM room keyboard viewport debug logs (never on by default in prod). */
    __DIBAY_CM_ROOM_KB_DEBUG__?: boolean;
  }
}

function isCmRoomKbDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__DIBAY_CM_ROOM_KB_DEBUG__ === true) return true;
  return process.env.NODE_ENV !== "production";
}

function rectSnapshot(el: Element | null | undefined) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    width: Math.round(r.width),
  };
}

function measureBlockHeight(el: HTMLElement | null | undefined): number {
  if (!el) return 0;
  return Math.max(0, Math.round(el.getBoundingClientRect().height));
}

function measureTimelineTopOffsetPx(shell: HTMLElement): number {
  const timelineEl = shell.querySelector<HTMLElement>(".cm-room-timeline");
  if (!timelineEl) return measureBlockHeight(shell.querySelector<HTMLElement>(".chat-header"));
  const shellTop = shell.getBoundingClientRect().top;
  const timelineTop = timelineEl.getBoundingClientRect().top;
  return Math.max(0, Math.round(timelineTop - shellTop));
}

/**
 * Telegram/KakaoTalk-style CM room viewport shell.
 * SSOT: `visualViewport.height` — shell height + timeline box height.
 * keyboard open: safe-bottom / nav gap padding 제거 (composer는 키보드 바로 위).
 * DO NOT re-apply overlay keyboard gap as composer padding (iOS double offset).
 */
export function useCmRoomVisibleViewportShell(opts: Options): void {
  const { enabled, shellRef } = opts;

  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;

    let baselineClosedHeightPx = resolveCmRoomVisibleViewportHeightPxFromWindow();
    let syncRaf = 0;
    let chromeSyncPending = false;

    const applyChromeHeights = () => {
      chromeSyncPending = false;
      const composerBlockEl = shell.querySelector<HTMLElement>(".cm-room-composer");
      const tradeDockEl = shell.querySelector<HTMLElement>("[data-cm-trade-dock]");
      const timelineEl = shell.querySelector<HTMLElement>(".cm-room-timeline");
      const timelineTopOffsetPx = measureTimelineTopOffsetPx(shell);
      const composerBlockPx = measureBlockHeight(composerBlockEl);
      const tradeDockPx = measureBlockHeight(tradeDockEl);
      const footerChromePx = composerBlockPx + tradeDockPx;
      const tailGapPx = CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX;

      shell.style.setProperty("--cm-room-header-height", `${timelineTopOffsetPx}px`);
      shell.style.setProperty("--chat-composer-height", `${composerBlockPx}px`);
      shell.style.setProperty("--cm-trade-dock-height", `${tradeDockPx}px`);
      shell.style.setProperty(
        "--cm-timeline-scroll-padding-bottom",
        `${Math.max(tailGapPx, tradeDockPx + tailGapPx)}px`
      );

      const snapshot = buildCmRoomVisibleViewportSnapshot(baselineClosedHeightPx);
      baselineClosedHeightPx = snapshot.baselineClosedHeightPx;

      shell.dataset.cmKeyboardOpen = snapshot.keyboardOpen ? "true" : "false";

      shell.style.height = `${snapshot.visibleHeightPx}px`;
      shell.style.maxHeight = `${snapshot.visibleHeightPx}px`;
      shell.style.minHeight = `${snapshot.visibleHeightPx}px`;
      shell.style.setProperty("--cm-room-visible-height", `${snapshot.visibleHeightPx}px`);

      const timelinePx = resolveCmRoomTimelineHeightPx({
        visibleHeightPx: snapshot.visibleHeightPx,
        timelineTopOffsetPx,
        footerChromeHeightPx: footerChromePx,
      });
      shell.style.setProperty("--cm-room-timeline-height", `${timelinePx}px`);

      const composerPadPx = resolveCmRoomComposerBottomPaddingPx({
        keyboardOpen: snapshot.keyboardOpen,
      });
      if (composerPadPx == null) {
        shell.style.removeProperty("--cm-room-composer-bottom-padding");
      } else {
        shell.style.setProperty("--cm-room-composer-bottom-padding", `${composerPadPx}px`);
      }

      if (isCmRoomKbDebugEnabled()) {
        const vv = window.visualViewport;
        // Layout metrics only — never log message text / PII.
        console.info("[cm-room-kb-viewport]", {
          platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "other",
          innerHeight: window.innerHeight,
          clientHeight: document.documentElement.clientHeight,
          vvHeight: vv?.height ?? null,
          vvOffsetTop: vv?.offsetTop ?? null,
          keyboardOpen: snapshot.keyboardOpen,
          overlayGapPx: snapshot.overlayGapPx,
          visibleHeightPx: snapshot.visibleHeightPx,
          composerPadPx,
          safeBottomFallback: composerPadPx == null,
          shell: rectSnapshot(shell),
          timeline: rectSnapshot(timelineEl),
          composer: rectSnapshot(composerBlockEl),
        });
      }

      shell.dispatchEvent(
        new CustomEvent(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, {
          detail: { roomId: shell.dataset.cmRoomId ?? "" },
        })
      );
    };

    const scheduleSync = () => {
      if (chromeSyncPending) return;
      chromeSyncPending = true;
      cancelAnimationFrame(syncRaf);
      syncRaf = requestAnimationFrame(() => {
        syncRaf = requestAnimationFrame(() => {
          syncRaf = 0;
          applyChromeHeights();
        });
      });
    };

    scheduleSync();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleSync)
        : null;
    const timelineEl = shell.querySelector(".cm-room-timeline");
    const composerEl = shell.querySelector(".cm-room-composer");
    const tradeDockEl = shell.querySelector("[data-cm-trade-dock]");
    const headerEl = shell.querySelector(".chat-header");
    if (timelineEl) ro?.observe(timelineEl);
    if (composerEl) ro?.observe(composerEl);
    if (tradeDockEl) ro?.observe(tradeDockEl);
    if (headerEl) ro?.observe(headerEl);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", scheduleSync);
    vv?.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);
    document.addEventListener("focusin", scheduleSync, true);
    document.addEventListener("focusout", scheduleSync, true);
    const unsubNativeKeyboard = subscribeSamarketShellKeyboardInsets(scheduleSync);

    return () => {
      cancelAnimationFrame(syncRaf);
      ro?.disconnect();
      vv?.removeEventListener("resize", scheduleSync);
      vv?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      document.removeEventListener("focusin", scheduleSync, true);
      document.removeEventListener("focusout", scheduleSync, true);
      unsubNativeKeyboard();
      shell.style.removeProperty("height");
      shell.style.removeProperty("maxHeight");
      shell.style.removeProperty("minHeight");
      shell.style.removeProperty("--cm-room-visible-height");
      shell.style.removeProperty("--cm-room-timeline-height");
      shell.style.removeProperty("--cm-room-header-height");
      shell.style.removeProperty("--cm-room-composer-bottom-padding");
      shell.style.removeProperty("--chat-composer-height");
      shell.style.removeProperty("--cm-trade-dock-height");
      shell.style.removeProperty("--cm-timeline-scroll-padding-bottom");
      delete shell.dataset.cmKeyboardOpen;
    };
  }, [enabled, shellRef]);
}

function resolveCmRoomVisibleViewportHeightPxFromWindow(): number {
  const vv = window.visualViewport;
  const raw = vv ? vv.height : window.innerHeight;
  return Math.max(240, Math.round(raw));
}
