"use client";

import { useEffect, useState } from "react";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";
import {
  buildFormKeyboardViewportSnapshot,
  resolveFormVisualViewportFrame,
  type FormKeyboardViewportSnapshot,
} from "@/lib/ui/form-keyboard-viewport-contract";

const CLOSED_SNAPSHOT: FormKeyboardViewportSnapshot = {
  keyboardOpen: false,
  visualViewportHeight: 0,
  visualViewportOffsetTop: 0,
  effectiveViewportBottom: 0,
  keyboardOcclusionInset: 0,
  safeBottom: 0,
  effectiveBottomInset: 0,
};

/**
 * Form (TYPE B) keyboard / viewport authority.
 * Consumers apply `effectiveBottomInset` only — do not add `--safe-bottom` again.
 */
export function useFormKeyboardViewport(options?: { enabled?: boolean }): FormKeyboardViewportSnapshot {
  const enabled = options?.enabled !== false;
  const [snap, setSnap] = useState<FormKeyboardViewportSnapshot>(CLOSED_SNAPSHOT);

  useEffect(() => {
    if (!enabled) {
      setSnap(CLOSED_SNAPSHOT);
      return;
    }
    if (typeof window === "undefined") return;

    let baselineClosedHeightPx = resolveFormVisualViewportFrame().heightPx;
    let raf = 0;
    let pending = false;

    const measure = () => {
      pending = false;
      const next = buildFormKeyboardViewportSnapshot({
        baselineClosedHeightPx,
        nativeShellInsetPx: readSamarketShellKeyboardBottomInsetCssPx(),
      });
      baselineClosedHeightPx = next.baselineClosedHeightPx;
      setSnap({
        keyboardOpen: next.keyboardOpen,
        visualViewportHeight: next.visualViewportHeight,
        visualViewportOffsetTop: next.visualViewportOffsetTop,
        effectiveViewportBottom: next.effectiveViewportBottom,
        keyboardOcclusionInset: next.keyboardOcclusionInset,
        safeBottom: next.safeBottom,
        effectiveBottomInset: next.effectiveBottomInset,
      });
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          measure();
        });
      });
    };

    measure();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    const unsub = subscribeSamarketShellKeyboardInsets(schedule);

    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      unsub();
    };
  }, [enabled]);

  return snap;
}
