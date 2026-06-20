"use client";

import { useEffect, type RefObject } from "react";
import {
  resolveChatBottomInsetCssPx,
  resolveChatViewportShellPlatform,
  type ChatViewportShellLayoutMode,
} from "@/lib/ui/chat-viewport-shell-platform";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import { resolveLayoutVisibleViewportCssPx } from "@/lib/ui/layout-visible-viewport-px";
import {
  applyChatViewportHeightToRoot,
  CHAT_VIEWPORT_HEIGHT_CSS_VAR,
  clearChatViewportHeightFromRoot,
} from "@/lib/ui/chat-viewport-height-sync";
import { MESSENGER_CHAT_SHELL_MIN_HEIGHT_PX } from "@/lib/ui/messenger-chat-viewport-tuning";
import { logChatRoomScroll } from "@/lib/community-messenger/room/messenger-room-timeline-log";

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLDivElement | null>;
  layoutMode: ChatViewportShellLayoutMode;
  observeComposerHeight?: boolean;
};

function syncComposerHeightMetric(shell: HTMLElement): void {
  const composer = shell.querySelector<HTMLElement>("[data-cm-composer]");
  const h = composer?.offsetHeight ?? 0;
  const prevRaw = shell.style.getPropertyValue("--chat-composer-height");
  const prev = prevRaw ? Number.parseInt(prevRaw, 10) : 0;
  if (h > 0) {
    shell.style.setProperty("--chat-composer-height", `${h}px`);
  } else {
    shell.style.removeProperty("--chat-composer-height");
  }
  if (h > 0 && h !== prev) {
    logChatRoomScroll("composer_height_changed", {
      composerHeightPx: h,
      prevComposerHeightPx: prev > 0 ? prev : null,
    });
  }
}

/**
 * 채팅 셸 CSS 변수:
 * --chat-viewport-height (vv edge + P0.1 root chain), --chat-composer-height,
 * --chat-bottom-inset (keyboard/nav gap overlay — CSS calc with --safe-bottom)
 */
export function useChatViewportShellInsets(opts: Options): void {
  const { enabled, shellRef, layoutMode, observeComposerHeight = false } = opts;

  useEffect(() => {
    if (!enabled) {
      clearChatViewportHeightFromRoot();
      return;
    }
    const shell = shellRef.current;
    if (!shell) return;

    const platform = resolveChatViewportShellPlatform();
    shell.dataset.chatShellPlatform = platform;
    shell.dataset.chatShellLayout = layoutMode;

    let syncRaf = 0;
    const syncAll = () => {
      if (layoutMode !== "embedded") {
        const visiblePx = resolveLayoutVisibleViewportCssPx(MESSENGER_CHAT_SHELL_MIN_HEIGHT_PX);
        applyChatViewportHeightToRoot(visiblePx);
        shell.style.setProperty(CHAT_VIEWPORT_HEIGHT_CSS_VAR, `${visiblePx}px`);
      } else {
        clearChatViewportHeightFromRoot();
        shell.style.removeProperty(CHAT_VIEWPORT_HEIGHT_CSS_VAR);
      }

      const bottomInset = resolveChatBottomInsetCssPx();
      if (bottomInset > 0) {
        shell.style.setProperty("--chat-bottom-inset", `${bottomInset}px`);
      } else {
        shell.style.removeProperty("--chat-bottom-inset");
      }

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

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
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
      clearChatViewportHeightFromRoot();
      shell.style.removeProperty(CHAT_VIEWPORT_HEIGHT_CSS_VAR);
      shell.style.removeProperty("--chat-bottom-inset");
      shell.style.removeProperty("--chat-composer-height");
      delete shell.dataset.chatShellPlatform;
      delete shell.dataset.chatShellLayout;
    };
  }, [enabled, layoutMode, observeComposerHeight, shellRef]);
}
