"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  shouldApplyIosFormLayoutWriter,
  type IosFormVisibleBandPx,
} from "@/lib/ui/ios-form-keyboard-viewport-contract";
import { acquireIosFormKeyboardViewport } from "@/lib/ui/ios-form-keyboard-viewport-store";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";

const ROOT_OWNER_ATTR = "data-dibay-kb-owner";
const ROOT_KB_ATTR = "data-dibay-ios-form-kb";
const VV_TOP_VAR = "--dibay-vv-top";
const VV_HEIGHT_VAR = "--dibay-vv-height";
const KB_INSET_VAR = "--dibay-keyboard-inset";

type Options = {
  /** Mount as a form / sheet keyboard consumer */
  enabled: boolean;
  /** Optional shell to pin height into (login page). Center sheets use CSS vars on html. */
  shellRef?: RefObject<HTMLElement | null>;
  /** When true, clamp document scrollY on keyboard open (WK focus scroll). */
  clampDocumentScroll?: boolean;
};

function clearRootKeyboardVars(root: HTMLElement): void {
  root.style.removeProperty(VV_TOP_VAR);
  root.style.removeProperty(VV_HEIGHT_VAR);
  root.style.removeProperty(KB_INSET_VAR);
  root.removeAttribute(ROOT_KB_ATTR);
  if (root.getAttribute(ROOT_OWNER_ATTR) === "ios_form_visible_band") {
    root.removeAttribute(ROOT_OWNER_ATTR);
  }
}

function applyRootKeyboardVars(root: HTMLElement, band: IosFormVisibleBandPx): void {
  if (!shouldApplyIosFormLayoutWriter(band) || !band.keyboardOpen) {
    clearRootKeyboardVars(root);
    if (band.owner === "ios_form_visible_band") {
      root.setAttribute(ROOT_OWNER_ATTR, "ios_form_visible_band");
    }
    return;
  }
  root.setAttribute(ROOT_OWNER_ATTR, "ios_form_visible_band");
  root.setAttribute(ROOT_KB_ATTR, "1");
  root.style.setProperty(VV_TOP_VAR, `${band.topPx}px`);
  root.style.setProperty(VV_HEIGHT_VAR, `${band.heightPx}px`);
  root.style.setProperty(KB_INSET_VAR, `${band.insetCssPx}px`);
}

function applyShellBand(shell: HTMLElement | null, band: IosFormVisibleBandPx): void {
  if (!shell) return;
  if (!shouldApplyIosFormLayoutWriter(band) || !band.keyboardOpen) {
    shell.style.removeProperty("height");
    shell.style.removeProperty("max-height");
    shell.style.removeProperty("min-height");
    shell.style.removeProperty("top");
    shell.dataset.dibayIosFormKb = "0";
    return;
  }
  shell.dataset.dibayIosFormKb = "1";
  shell.style.height = `${band.heightPx}px`;
  shell.style.maxHeight = `${band.heightPx}px`;
  shell.style.minHeight = `${band.heightPx}px`;
  if (band.topPx > 0) {
    shell.style.top = `${band.topPx}px`;
  } else {
    shell.style.removeProperty("top");
  }
}

/**
 * iOS form / center-sheet keyboard visible band.
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
      applyRootKeyboardVars(root, next);
      applyShellBand(shellRef?.current ?? shellEl, next);

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
      clearRootKeyboardVars(root);
      applyShellBand(shellEl, {
        keyboardOpen: false,
        topPx: 0,
        heightPx: window.innerHeight,
        insetCssPx: 0,
        bandAuthority: "layout",
        owner: "none",
      });
    };
  }, [enabled, shellRef, clampDocumentScroll]);

  return band;
}
