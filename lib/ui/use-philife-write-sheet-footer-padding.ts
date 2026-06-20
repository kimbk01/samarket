"use client";

import { useEffect, type RefObject } from "react";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import {
  buildCmRoomVisibleViewportSnapshot,
  resolveCmRoomComposerBottomPaddingPx,
  resolveCmRoomVisibleViewportHeightPx,
} from "@/lib/ui/cm-room-visible-viewport-contract";
import { resolveIosKeyboardOverlayCssPx } from "@/lib/ui/use-cm-room-kb-offset";

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

/**
 * Philife 글쓰기 시트 footer — CM room composer 와 동일 padding SSOT.
 * keyboard closed: `--philife-write-footer-pb` unset → `safe-bottom`
 * keyboard open Android: `0px` · iOS overlay: kb offset px only (safe-bottom 제거)
 */
export function usePhilifeWriteSheetFooterPadding(opts: Options): void {
  const { enabled, shellRef } = opts;

  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;

    let baselineClosedHeightPx = resolveCmRoomVisibleViewportHeightPx();
    let syncRaf = 0;

    const sync = () => {
      const snapshot = buildCmRoomVisibleViewportSnapshot(baselineClosedHeightPx);
      baselineClosedHeightPx = snapshot.baselineClosedHeightPx;

      const iosKbPx = resolveIosKeyboardOverlayCssPx();
      shell.dataset.philifeKeyboardOpen = snapshot.keyboardOpen ? "true" : "false";

      const padPx = resolveCmRoomComposerBottomPaddingPx({
        keyboardOpen: snapshot.keyboardOpen,
        iosOverlayKbOffsetPx: iosKbPx,
        overlayGapPx: snapshot.overlayGapPx,
      });

      if (padPx == null) {
        shell.style.removeProperty("--philife-write-footer-pb");
      } else {
        shell.style.setProperty("--philife-write-footer-pb", `${padPx}px`);
      }
    };

    const scheduleSync = () => {
      cancelAnimationFrame(syncRaf);
      syncRaf = requestAnimationFrame(() => {
        syncRaf = requestAnimationFrame(() => {
          syncRaf = 0;
          sync();
        });
      });
    };

    scheduleSync();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", scheduleSync);
    vv?.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);
    document.addEventListener("focusin", scheduleSync, true);
    document.addEventListener("focusout", scheduleSync, true);
    const unsubNative = subscribeSamarketShellKeyboardInsets(scheduleSync);

    return () => {
      cancelAnimationFrame(syncRaf);
      vv?.removeEventListener("resize", scheduleSync);
      vv?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      document.removeEventListener("focusin", scheduleSync, true);
      document.removeEventListener("focusout", scheduleSync, true);
      unsubNative();
      shell.style.removeProperty("--philife-write-footer-pb");
      delete shell.dataset.philifeKeyboardOpen;
    };
  }, [enabled, shellRef]);
}
