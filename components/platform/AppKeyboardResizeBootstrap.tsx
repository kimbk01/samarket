"use client";

import { useEffect } from "react";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import { acquireIosFormKeyboardViewport } from "@/lib/ui/ios-form-keyboard-viewport-store";
import {
  applyDibayIosFormKeyboardRootVars,
  clearDibayIosFormKeyboardRootVars,
  isDibayKeyboardResizeFocusTarget,
} from "@/lib/ui/dibay-ios-form-keyboard-dom";
import { shouldApplyIosFormLayoutWriter } from "@/lib/ui/ios-form-keyboard-viewport-contract";

/**
 * Global iOS keyboard → visible-band bootstrap for all non-room inputs.
 * Measurement: single store (ios-form-keyboard-viewport-store).
 * Layout: CSS on html[data-dibay-ios-form-kb] (app shell / sheets / form shells).
 * Android / desktop / CM room: no-op.
 */
export function AppKeyboardResizeBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLikelyIosWebKit()) return;

    const root = document.documentElement;
    let release: (() => void) | null = null;
    let blurTimer = 0;
    let lastOpen: boolean | null = null;

    const deactivate = () => {
      window.clearTimeout(blurTimer);
      blurTimer = 0;
      release?.();
      release = null;
      lastOpen = null;
      clearDibayIosFormKeyboardRootVars(root);
    };

    const activate = () => {
      if (release) return;
      release = acquireIosFormKeyboardViewport((band) => {
        applyDibayIosFormKeyboardRootVars(root, band);
        if (shouldApplyIosFormLayoutWriter(band) && band.keyboardOpen) {
          if (lastOpen !== true) {
            window.scrollTo(0, 0);
            if (document.body) document.body.scrollTop = 0;
            root.scrollTop = 0;
          }
        }
        lastOpen = band.keyboardOpen;
      });
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isDibayKeyboardResizeFocusTarget(event.target)) return;
      window.clearTimeout(blurTimer);
      blurTimer = 0;
      activate();
    };

    const onFocusOut = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        blurTimer = 0;
        if (isDibayKeyboardResizeFocusTarget(document.activeElement)) return;
        deactivate();
      }, 160);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      deactivate();
    };
  }, []);

  return null;
}
