"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  shouldApplyIosFormLayoutWriter,
  type IosFormVisibleBandPx,
} from "@/lib/ui/ios-form-keyboard-viewport-contract";
import { acquireIosFormKeyboardViewport, getIosFormKeyboardViewportConsumerCount } from "@/lib/ui/ios-form-keyboard-viewport-store";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import {
  applyDibayIosFormKeyboardRootVars,
  applyDibayIosFormShellBand,
  clearDibayIosFormKeyboardRootVars,
} from "@/lib/ui/dibay-ios-form-keyboard-dom";

type Options = {
  /** Mount as a form / sheet keyboard consumer */
  enabled: boolean;
  /** Optional shell to pin height into (login page). Center sheets use CSS vars on html. */
  shellRef?: RefObject<HTMLElement | null>;
  /** When true, clamp document scrollY on keyboard open (WK focus scroll). */
  clampDocumentScroll?: boolean;
};

/**
 * iOS form / center-sheet keyboard visible band (explicit surface consumer).
 * Prefer AppKeyboardResizeBootstrap for global focus coverage; use this when a
 * dedicated shellRef must be pinned (login) or sheet mounts before focus.
 * Android: no-op (adjustResize). CM room present: no layout writes.
 */
export function useIosFormKeyboardVisibleBand(opts: Options): IosFormVisibleBandPx | null {
  const { enabled, shellRef, clampDocumentScroll = true } = opts;
  const [band, setBand] = useState<IosFormVisibleBandPx | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBand(null);
      return;
    }
    if (typeof window === "undefined") return;
    if (!isLikelyIosWebKit()) {
      setBand(null);
      return;
    }

    const root = document.documentElement;
    let lastOpen: boolean | null = null;
    const shellEl = shellRef?.current ?? null;

    const release = acquireIosFormKeyboardViewport((next) => {
      setBand(next);
      applyDibayIosFormKeyboardRootVars(root, next);
      applyDibayIosFormShellBand(shellRef?.current ?? shellEl, next);

      if (clampDocumentScroll && shouldApplyIosFormLayoutWriter(next) && next.keyboardOpen) {
        if (lastOpen !== true) {
          window.scrollTo(0, 0);
          if (document.body) document.body.scrollTop = 0;
          root.scrollTop = 0;
        }
      }
      lastOpen = next.keyboardOpen;
    });

    return () => {
      release();
      applyDibayIosFormShellBand(shellEl, {
        keyboardOpen: false,
        topPx: 0,
        heightPx: window.innerHeight,
        insetCssPx: 0,
        bandAuthority: "layout",
        owner: "none",
      });
      // Other consumers (global bootstrap) may still own root vars.
      if (getIosFormKeyboardViewportConsumerCount() === 0) {
        clearDibayIosFormKeyboardRootVars(root);
      }
    };
  }, [enabled, shellRef, clampDocumentScroll]);

  return band;
}
