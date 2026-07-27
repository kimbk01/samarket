"use client";

import { useEffect, type RefObject } from "react";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import {
  buildCmRoomVisibleViewportSnapshot,
  CM_ROOM_CHROME_HEIGHT_SYNC_EVENT,
  CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX,
  resolveCmRoomComposerBottomPaddingPx,
  resolveCmRoomComposerToVisualBottomGapPx,
  resolveCmRoomShellVisualFramePx,
  resolveCmRoomTimelineHeightPx,
} from "@/lib/ui/cm-room-visible-viewport-contract";

export { CM_ROOM_CHROME_HEIGHT_SYNC_EVENT };

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

declare global {
  interface Window {
    /** Explicit opt-in for CM room keyboard viewport debug logs. */
    __DIBAY_CM_ROOM_KB_DEBUG__?: boolean;
    /** Last metrics snapshot (debug only) — layout numbers, never message text. */
    __DIBAY_CM_ROOM_KB_LAST__?: Record<string, unknown>;
  }
}

function isCmRoomKbDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__DIBAY_CM_ROOM_KB_DEBUG__ === true) return true;
  try {
    if (window.localStorage?.getItem("__DIBAY_CM_ROOM_KB_DEBUG__") === "1") return true;
  } catch {
    /* ignore */
  }
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

function readCssPx(el: Element, prop: string): string {
  return getComputedStyle(el).getPropertyValue(prop).trim() || "";
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

function clearShellVisualFramePosition(shell: HTMLElement): void {
  shell.style.removeProperty("position");
  shell.style.removeProperty("top");
  shell.style.removeProperty("left");
  shell.style.removeProperty("right");
  shell.style.removeProperty("width");
}

/**
 * Pin shell into the visual viewport band (layout coords inside transformed `.messenger-page`).
 * Height-only at y=0 fails when iOS raises visualViewport.offsetTop (composer jumps to visual top).
 * Uses top/height — not CSS transform keyboard patches (LOCK).
 */
function applyShellVisualFrame(shell: HTMLElement, frame: { heightPx: number; offsetTopPx: number }): void {
  const pinToVisualBand = frame.offsetTopPx > 0;
  if (pinToVisualBand) {
    shell.style.position = "absolute";
    shell.style.top = `${frame.offsetTopPx}px`;
    shell.style.left = "0";
    shell.style.right = "0";
    shell.style.width = "100%";
  } else {
    clearShellVisualFramePosition(shell);
  }
  shell.style.height = `${frame.heightPx}px`;
  shell.style.maxHeight = `${frame.heightPx}px`;
  shell.style.minHeight = `${frame.heightPx}px`;
  shell.style.setProperty("--cm-room-visible-height", `${frame.heightPx}px`);
}

/**
 * Telegram/KakaoTalk-style CM room viewport shell.
 * SSOT: visualViewport band = offsetTop + height (not height alone at layout y=0).
 * keyboard open: safe-bottom / nav gap padding 제거 (composer는 키보드 바로 위).
 * DO NOT re-apply overlay keyboard gap as composer padding (iOS double offset).
 */
export function useCmRoomVisibleViewportShell(opts: Options): void {
  const { enabled, shellRef } = opts;

  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;

    let baselineClosedHeightPx = resolveCmRoomShellVisualFramePx().heightPx;
    let syncRaf = 0;
    let chromeSyncPending = false;
    let lastKeyboardOpen: boolean | null = null;

    const emitDebug = (event: string, extra?: Record<string, unknown>) => {
      if (!isCmRoomKbDebugEnabled()) return;
      const vv = window.visualViewport;
      const frame = resolveCmRoomShellVisualFramePx();
      const composerBlockEl = shell.querySelector<HTMLElement>(".cm-room-composer");
      const timelineEl = shell.querySelector<HTMLElement>(".cm-room-timeline");
      const headerEl = shell.querySelector<HTMLElement>(".chat-header");
      const composerRect = composerBlockEl?.getBoundingClientRect();
      const composerBottom = composerRect ? Math.round(composerRect.bottom) : null;
      const gap =
        composerBottom == null ? null : resolveCmRoomComposerToVisualBottomGapPx(composerBottom);
      const cs = getComputedStyle(shell);
      const ccs = composerBlockEl ? getComputedStyle(composerBlockEl) : null;
      const payload = {
        event,
        href: typeof location !== "undefined" ? location.pathname : "",
        activeElement:
          document.activeElement instanceof HTMLElement
            ? document.activeElement.tagName.toLowerCase()
            : null,
        windowInnerHeight: window.innerHeight,
        documentClientHeight: document.documentElement.clientHeight,
        bodyScrollTop: document.body.scrollTop,
        documentScrollTop: document.documentElement.scrollTop,
        visualViewport: vv
          ? {
              height: vv.height,
              width: vv.width,
              offsetTop: vv.offsetTop,
              offsetLeft: vv.offsetLeft,
              pageTop: vv.pageTop,
              scale: vv.scale,
            }
          : null,
        shellRect: rectSnapshot(shell),
        headerRect: rectSnapshot(headerEl),
        timelineRect: rectSnapshot(timelineEl),
        composerRect: rectSnapshot(composerBlockEl),
        composerPosition: ccs?.position ?? null,
        composerBottom: ccs?.bottom ?? null,
        composerTransform: ccs?.transform ?? null,
        composerPaddingBottom: ccs?.paddingBottom ?? null,
        shellDisplay: cs.display,
        shellPosition: cs.position,
        shellHeight: cs.height,
        shellMinHeight: cs.minHeight,
        shellMaxHeight: cs.maxHeight,
        shellOverflow: cs.overflow,
        shellTopInline: shell.style.top || null,
        cssVisibleViewportHeight: readCssPx(shell, "--cm-room-visible-height"),
        cssComposerBottomPadding: readCssPx(shell, "--cm-room-composer-bottom-padding"),
        visualBottom: frame.visualBottomPx,
        frameOffsetTop: frame.offsetTopPx,
        frameHeight: frame.heightPx,
        composerToVisualBottomGap: gap,
        ...extra,
      };
      window.__DIBAY_CM_ROOM_KB_LAST__ = payload;
      console.info("[cm-room-kb-viewport]", payload);
    };

    const applyChromeHeights = (event: string) => {
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
      const frame = resolveCmRoomShellVisualFramePx();

      shell.dataset.cmKeyboardOpen = snapshot.keyboardOpen ? "true" : "false";
      applyShellVisualFrame(shell, frame);

      const timelinePx = resolveCmRoomTimelineHeightPx({
        visibleHeightPx: frame.heightPx,
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

      if (lastKeyboardOpen !== snapshot.keyboardOpen) {
        lastKeyboardOpen = snapshot.keyboardOpen;
        emitDebug(snapshot.keyboardOpen ? "keyboard_open_changed_true" : "keyboard_open_changed_false", {
          keyboardOpen: snapshot.keyboardOpen,
          overlayGapPx: snapshot.overlayGapPx,
          composerPadPx,
          safeBottomFallback: composerPadPx == null,
        });
      } else {
        emitDebug(event, {
          keyboardOpen: snapshot.keyboardOpen,
          overlayGapPx: snapshot.overlayGapPx,
          composerPadPx,
          safeBottomFallback: composerPadPx == null,
        });
      }

      shell.dispatchEvent(
        new CustomEvent(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, {
          detail: { roomId: shell.dataset.cmRoomId ?? "" },
        })
      );
    };

    const scheduleSync = (event: string) => {
      if (chromeSyncPending) return;
      chromeSyncPending = true;
      cancelAnimationFrame(syncRaf);
      syncRaf = requestAnimationFrame(() => {
        syncRaf = requestAnimationFrame(() => {
          syncRaf = 0;
          applyChromeHeights(event);
        });
      });
    };

    scheduleSync("room_mount");

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => scheduleSync("resize_observer"))
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
    const onVvResize = () => scheduleSync("visualViewport_resize");
    const onVvScroll = () => scheduleSync("visualViewport_scroll");
    const onWinResize = () => scheduleSync("window_resize");
    const onOrientation = () => scheduleSync("orientationchange");
    const onFocusIn = () => scheduleSync("focusin");
    const onFocusOut = () => scheduleSync("focusout");
    vv?.addEventListener("resize", onVvResize);
    vv?.addEventListener("scroll", onVvScroll);
    window.addEventListener("resize", onWinResize);
    window.addEventListener("orientationchange", onOrientation);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    const unsubNativeKeyboard = subscribeSamarketShellKeyboardInsets(() =>
      scheduleSync("native_keyboard")
    );

    return () => {
      cancelAnimationFrame(syncRaf);
      ro?.disconnect();
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvScroll);
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      unsubNativeKeyboard();
      clearShellVisualFramePosition(shell);
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
