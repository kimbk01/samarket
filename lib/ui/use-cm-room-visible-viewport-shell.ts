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
    /** Last layout metrics snapshot when debug is on — never message text / PII. */
    __DIBAY_CM_ROOM_KB_LAST__?: Record<string, unknown>;
  }
}

function isCmRoomKbDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__DIBAY_CM_ROOM_KB_DEBUG__ === true) return true;
  try {
    if (window.localStorage?.getItem("__DIBAY_CM_ROOM_KB_DEBUG__") === "1") return true;
  } catch {
    /* private mode */
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

function readCssProp(el: Element, prop: string): string {
  return getComputedStyle(el).getPropertyValue(prop).trim() || "";
}

/** Debug-only metrics — distinguishes visualViewport band vs document scroll. */
function buildCmRoomKbDebugPayload(args: {
  event: string;
  shell: HTMLElement;
  timelineEl: HTMLElement | null;
  composerBlockEl: HTMLElement | null;
  headerEl: HTMLElement | null;
  keyboardOpen: boolean;
  overlayGapPx: number;
  visibleHeightPx: number;
  composerPadPx: number | null;
}): Record<string, unknown> {
  const vv = window.visualViewport;
  const composerRect = args.composerBlockEl?.getBoundingClientRect() ?? null;
  const vvOffsetTop = vv ? Math.round(vv.offsetTop) : null;
  const vvHeight = vv ? Math.round(vv.height) : null;
  const visualBottom =
    vvOffsetTop != null && vvHeight != null ? vvOffsetTop + vvHeight : null;
  const composerBottom = composerRect ? Math.round(composerRect.bottom) : null;
  const composerToVisualBottomGap =
    visualBottom != null && composerBottom != null ? visualBottom - composerBottom : null;
  const shellCs = getComputedStyle(args.shell);
  const composerCs = args.composerBlockEl ? getComputedStyle(args.composerBlockEl) : null;
  const messengerPage = args.shell.closest(".messenger-page");

  return {
    event: args.event,
    href: typeof location !== "undefined" ? location.pathname : "",
    activeElement:
      document.activeElement instanceof HTMLElement
        ? `${document.activeElement.tagName.toLowerCase()}${
            document.activeElement.getAttribute("data-cm-composer") != null ||
            document.activeElement.getAttribute("data-chat-composer") != null
              ? "[composer]"
              : ""
          }`
        : null,
    windowInnerHeight: window.innerHeight,
    documentClientHeight: document.documentElement.clientHeight,
    // REQUIRED: separate document scroll from visualViewport.offsetTop
    documentScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop,
    windowScrollY: window.scrollY,
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
    shellRect: rectSnapshot(args.shell),
    headerRect: rectSnapshot(args.headerEl),
    timelineRect: rectSnapshot(args.timelineEl),
    composerRect: rectSnapshot(args.composerBlockEl),
    messengerPageRect: rectSnapshot(messengerPage),
    composerPosition: composerCs?.position ?? null,
    composerBottomCss: composerCs?.bottom ?? null,
    composerTransform: composerCs?.transform ?? null,
    composerPaddingBottom: composerCs?.paddingBottom ?? null,
    shellDisplay: shellCs.display,
    shellPosition: shellCs.position,
    shellHeight: shellCs.height,
    shellMinHeight: shellCs.minHeight,
    shellMaxHeight: shellCs.maxHeight,
    shellOverflow: shellCs.overflow,
    shellTransform: shellCs.transform,
    keyboardOpen: args.keyboardOpen,
    overlayGapPx: args.overlayGapPx,
    visibleHeightPx: args.visibleHeightPx,
    composerPadPx: args.composerPadPx,
    safeBottomFallback: args.composerPadPx == null,
    cssVisibleViewportHeight: readCssProp(args.shell, "--cm-room-visible-height"),
    cssComposerBottomPadding: readCssProp(args.shell, "--cm-room-composer-bottom-padding"),
    visualBottom,
    composerToVisualBottomGap,
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
    let lastKeyboardOpen: boolean | null = null;

    const applyChromeHeights = (event: string) => {
      chromeSyncPending = false;
      const composerBlockEl = shell.querySelector<HTMLElement>(".cm-room-composer");
      const tradeDockEl = shell.querySelector<HTMLElement>("[data-cm-trade-dock]");
      const timelineEl = shell.querySelector<HTMLElement>(".cm-room-timeline");
      const headerEl = shell.querySelector<HTMLElement>(".chat-header");
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
        const debugEvent =
          lastKeyboardOpen !== snapshot.keyboardOpen
            ? snapshot.keyboardOpen
              ? "keyboard_open_changed_true"
              : "keyboard_open_changed_false"
            : event;
        lastKeyboardOpen = snapshot.keyboardOpen;
        // Layout metrics only — never log message text / PII.
        const payload = buildCmRoomKbDebugPayload({
          event: debugEvent,
          shell,
          timelineEl,
          composerBlockEl,
          headerEl,
          keyboardOpen: snapshot.keyboardOpen,
          overlayGapPx: snapshot.overlayGapPx,
          visibleHeightPx: snapshot.visibleHeightPx,
          composerPadPx,
        });
        window.__DIBAY_CM_ROOM_KB_LAST__ = payload;
        console.info("[cm-room-kb-viewport]", payload);
      } else {
        lastKeyboardOpen = snapshot.keyboardOpen;
      }

      shell.dispatchEvent(
        new CustomEvent(CM_ROOM_CHROME_HEIGHT_SYNC_EVENT, {
          detail: { roomId: shell.dataset.cmRoomId ?? "" },
        })
      );
    };

    const scheduleSync = (event = "sync") => {
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
