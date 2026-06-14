"use client";

import { useEffect, type RefObject } from "react";
import {
  resolveChatShellKeyboardOverlayCssPx,
  resolveChatViewportShellPlatform,
  type ChatViewportShellLayoutMode,
} from "@/lib/ui/chat-viewport-shell-platform";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLDivElement | null>;
  layoutMode: ChatViewportShellLayoutMode;
  /** call-pip-metrics 등 — `--chat-composer-height` 만 실측(레이아웃 높이 calc 금지) */
  observeComposerHeight?: boolean;
};

function syncComposerHeightMetric(shell: HTMLElement): void {
  const composer = shell.querySelector<HTMLElement>("[data-cm-composer]");
  const h = composer?.offsetHeight ?? 0;
  if (h > 0) {
    shell.style.setProperty("--chat-composer-height", `${h}px`);
  } else {
    shell.style.removeProperty("--chat-composer-height");
  }
}

/**
 * 채팅 셸 단일 관측 훅 — keyboard overlay padding + (선택) composer 높이.
 * composer 에 fixed/inset JS 를 넣지 않는다.
 */
export function useChatViewportShellInsets(opts: Options): void {
  const { enabled, shellRef, layoutMode, observeComposerHeight = false } = opts;

  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell) return;

    const platform = resolveChatViewportShellPlatform();
    shell.dataset.chatShellPlatform = platform;
    shell.dataset.chatShellLayout = layoutMode;

    let syncRaf = 0;
    const syncKeyboardOffset = () => {
      let offset = resolveChatShellKeyboardOverlayCssPx();
      const vv = window.visualViewport;
      if (vv && offset > 0) {
        const vvBottom = vv.offsetTop + vv.height;
        const shellBottom = shell.getBoundingClientRect().bottom;
        /** 100dvh 축소·adjustResize 가 이미 맞춘 경우 이중 padding 방지 */
        if (Math.abs(shellBottom - vvBottom) < 12) offset = 0;
      }
      if (offset > 0) {
        shell.style.setProperty("--chat-shell-keyboard-offset", `${offset}px`);
      } else {
        shell.style.removeProperty("--chat-shell-keyboard-offset");
      }
    };

    const syncAll = () => {
      syncKeyboardOffset();
      if (observeComposerHeight) syncComposerHeightMetric(shell);
    };

    const scheduleSync = () => {
      cancelAnimationFrame(syncRaf);
      syncRaf = requestAnimationFrame(() => {
        syncRaf = 0;
        syncAll();
      });
    };

    syncAll();

    let composerRo: ResizeObserver | null = null;
    if (observeComposerHeight) {
      const composer = shell.querySelector<HTMLElement>("[data-cm-composer]");
      if (composer && typeof ResizeObserver !== "undefined") {
        composerRo = new ResizeObserver(() => scheduleSync());
        composerRo.observe(composer);
      }
    }

    const vv = window.visualViewport;
    const onVv = () => scheduleSync();
    const onWin = () => scheduleSync();
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    window.addEventListener("resize", onWin);
    window.addEventListener("orientationchange", onWin);
    const unsubNative = subscribeSamarketShellKeyboardInsets(scheduleSync);

    return () => {
      cancelAnimationFrame(syncRaf);
      composerRo?.disconnect();
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("orientationchange", onWin);
      unsubNative();
      shell.style.removeProperty("--chat-shell-keyboard-offset");
      shell.style.removeProperty("--chat-composer-height");
      delete shell.dataset.chatShellPlatform;
      delete shell.dataset.chatShellLayout;
    };
  }, [enabled, layoutMode, observeComposerHeight, shellRef]);
}
