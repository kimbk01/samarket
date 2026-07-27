"use client";

import { useEffect, type RefObject } from "react";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import { emitCmRoomKbProbe } from "@/lib/ui/cm-room-kb-viewport-probe";
import {
  buildCmRoomVisibleViewportSnapshot,
  CM_ROOM_CHROME_HEIGHT_SYNC_EVENT,
  CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX,
  resolveCmRoomComposerBottomPaddingPx,
  resolveCmRoomShellVisualFramePx,
  resolveIosMessengerPageVisualBandPx,
} from "@/lib/ui/cm-room-visible-viewport-contract";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";

export { CM_ROOM_CHROME_HEIGHT_SYNC_EVENT };

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

const IOS_PAGE_VV_BAND_ATTR = "data-cm-ios-vv-band";

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

function resolveMessengerPage(shell: HTMLElement): HTMLElement | null {
  return shell.closest<HTMLElement>(".messenger-page");
}

function clearIosMessengerPageVisualBand(page: HTMLElement | null): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.removeProperty("--cm-ios-vv-band-top");
    root.style.removeProperty("--cm-ios-vv-band-height");
    delete root.dataset.cmIosVvBand;
  }
  if (!page) return;
  page.removeAttribute(IOS_PAGE_VV_BAND_ATTR);
}

/**
 * iOS keyboard open: pin `.messenger-page` to visualViewport band via CSS vars
 * (React `style={{ transform }}` on the page must not wipe layout — avoid inline top/height).
 * Android: never touch the page — adjustResize + shell height only.
 */
function applyIosMessengerPageVisualBand(
  page: HTMLElement | null,
  keyboardOpen: boolean,
  heightPx: number,
  offsetTopPx: number
): void {
  if (!isLikelyIosWebKit() || typeof document === "undefined") return;
  const band = resolveIosMessengerPageVisualBandPx({
    keyboardOpen,
    frame: { heightPx, offsetTopPx, visualBottomPx: offsetTopPx + heightPx },
  });
  if (!band) {
    clearIosMessengerPageVisualBand(page);
    return;
  }
  const root = document.documentElement;
  root.dataset.cmIosVvBand = "1";
  root.style.setProperty("--cm-ios-vv-band-top", `${band.topPx}px`);
  root.style.setProperty("--cm-ios-vv-band-height", `${band.heightPx}px`);
  page?.setAttribute(IOS_PAGE_VV_BAND_ATTR, "1");
}

function applyShellHeightAuthority(shell: HTMLElement, heightPx: number): void {
  shell.style.height = `${heightPx}px`;
  shell.style.maxHeight = `${heightPx}px`;
  shell.style.minHeight = `${heightPx}px`;
  shell.style.setProperty("--cm-room-visible-height", `${heightPx}px`);
}

function applyIosDocumentScrollLock(keyboardOpen: boolean): void {
  if (!isLikelyIosWebKit() || typeof document === "undefined") return;
  const root = document.documentElement;
  const body = document.body;
  if (!keyboardOpen) {
    if (root.dataset.cmIosKbScrollLock === "1") {
      root.style.removeProperty("overflow");
      body?.style.removeProperty("overflow");
      delete root.dataset.cmIosKbScrollLock;
    }
    return;
  }
  root.dataset.cmIosKbScrollLock = "1";
  root.style.overflow = "hidden";
  if (body) body.style.overflow = "hidden";
}

/**
 * Telegram/KakaoTalk-style CM room viewport shell.
 * Android: adjustResize + vv.height + open padding 0.
 * iOS: keyboard open → pin `.messenger-page` to vv band; open padding 0; no focus document scroll.
 * Timeline height is flex (`flex:1; min-height:0`) — do not write a fixed timeline height CSS variable.
 */
export function useCmRoomVisibleViewportShell(opts: Options): void {
  const { enabled, shellRef } = opts;

  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;
    const messengerPage = resolveMessengerPage(shell);

    let baselineClosedHeightPx = resolveCmRoomShellVisualFramePx().heightPx;
    let syncRaf = 0;
    let chromeSyncPending = false;
    let lastKeyboardOpen: boolean | null = null;

    const applyChromeHeights = (event: string) => {
      chromeSyncPending = false;
      const composerBlockEl = shell.querySelector<HTMLElement>(".cm-room-composer");
      const tradeDockEl = shell.querySelector<HTMLElement>("[data-cm-trade-dock]");
      const timelineTopOffsetPx = measureTimelineTopOffsetPx(shell);
      const composerBlockPx = measureBlockHeight(composerBlockEl);
      const tradeDockPx = measureBlockHeight(tradeDockEl);
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

      applyIosMessengerPageVisualBand(
        messengerPage,
        snapshot.keyboardOpen,
        frame.heightPx,
        frame.offsetTopPx
      );
      applyIosDocumentScrollLock(snapshot.keyboardOpen);
      applyShellHeightAuthority(shell, frame.heightPx);
      emitCmRoomKbProbe("shell_style_apply", shell, { keyboardOpen: snapshot.keyboardOpen });

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
        emitCmRoomKbProbe(
          snapshot.keyboardOpen ? "keyboard_open_change" : "keyboard_close",
          shell,
          { keyboardOpen: snapshot.keyboardOpen }
        );
        if (snapshot.keyboardOpen) {
          emitCmRoomKbProbe("stable_after_keyboard", shell, { keyboardOpen: true });
        }
      } else {
        emitCmRoomKbProbe(event, shell, { keyboardOpen: snapshot.keyboardOpen });
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
        ? new ResizeObserver(() => scheduleSync("composer_resize"))
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
    const onFocusIn = () => {
      emitCmRoomKbProbe("focus", shell);
      scheduleSync("after_focus");
    };
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
      clearIosMessengerPageVisualBand(messengerPage);
      applyIosDocumentScrollLock(false);
      shell.style.removeProperty("height");
      shell.style.removeProperty("maxHeight");
      shell.style.removeProperty("minHeight");
      shell.style.removeProperty("--cm-room-visible-height");
      shell.style.removeProperty("--cm-room-header-height");
      shell.style.removeProperty("--cm-room-composer-bottom-padding");
      shell.style.removeProperty("--chat-composer-height");
      shell.style.removeProperty("--cm-trade-dock-height");
      shell.style.removeProperty("--cm-timeline-scroll-padding-bottom");
      delete shell.dataset.cmKeyboardOpen;
    };
  }, [enabled, shellRef]);
}
