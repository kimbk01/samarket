"use client";

import { useEffect, type RefObject } from "react";
import { readSamarketShellKeyboardBottomInsetCssPx, subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import { CM_ROOM_KB_OFFSET_MIN_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

function resolveIosKeyboardOverlayCssPx(): number {
  if (typeof window === "undefined") return 0;

  const nativeInset = readSamarketShellKeyboardBottomInsetCssPx();
  if (nativeInset != null && nativeInset >= CM_ROOM_KB_OFFSET_MIN_PX) {
    return nativeInset;
  }

  const vv = window.visualViewport;
  if (!vv) return 0;

  const gap = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
  if (gap < CM_ROOM_KB_OFFSET_MIN_PX) return 0;

  return gap;
}

/**
 * iOS/WKWebView overlay keyboard — shell에 `--kb-offset` 단일 변수만 주입.
 * Android adjustResize + flex column — no-op.
 */
export function useCmRoomKbOffset(opts: Options): void {
  const { enabled, shellRef } = opts;

  useEffect(() => {
    if (!enabled || !isLikelyIosWebKit()) return;
    const shell = shellRef.current;
    if (!shell) return;

    let syncRaf = 0;
    const sync = () => {
      const px = resolveIosKeyboardOverlayCssPx();
      if (px > 0) {
        shell.style.setProperty("--kb-offset", `${px}px`);
      } else {
        shell.style.removeProperty("--kb-offset");
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
    const unsubNative = subscribeSamarketShellKeyboardInsets(scheduleSync);

    return () => {
      cancelAnimationFrame(syncRaf);
      vv?.removeEventListener("resize", scheduleSync);
      vv?.removeEventListener("scroll", scheduleSync);
      unsubNative();
      shell.style.removeProperty("--kb-offset");
    };
  }, [enabled, shellRef]);
}

export { resolveIosKeyboardOverlayCssPx };
