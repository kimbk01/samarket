"use client";

import { useEffect, useState } from "react";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";
import {
  detectFormKeyboardRuntimeContext,
  resolveFormAdapterKeyboardOcclusionInsetPx,
} from "@/lib/ui/form-keyboard-platform-adapter";
import {
  buildFormKeyboardViewportSnapshot,
  resolveFormLayoutWidthPx,
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
 * Geometry is adapter-local (HARD LOCK: one UX contract ≠ one formula).
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
    /** 기준 높이를 잰 레이아웃 폭 — 폭이 바뀌면(회전·분할) 기준을 다시 잡는다 (KB-04) */
    let baselineLayoutWidthPx = resolveFormLayoutWidthPx();
    let raf = 0;
    let pending = false;

    const measure = () => {
      pending = false;
      const runtimeContext = detectFormKeyboardRuntimeContext();
      const nativeShellInsetPx = readSamarketShellKeyboardBottomInsetCssPx();
      const keyboardOcclusionInsetOverride = resolveFormAdapterKeyboardOcclusionInsetPx(
        runtimeContext,
        { nativeShellInsetPx }
      );
      const next = buildFormKeyboardViewportSnapshot({
        baselineClosedHeightPx,
        baselineLayoutWidthPx,
        nativeShellInsetPx,
        safeBottomPx: runtimeContext.safeBottomPx,
        keyboardOcclusionInsetOverride,
        runtimeContext,
      });
      baselineClosedHeightPx = next.baselineClosedHeightPx;
      baselineLayoutWidthPx = next.baselineLayoutWidthPx;
      setSnap({
        keyboardOpen: next.keyboardOpen,
        visualViewportHeight: next.visualViewportHeight,
        visualViewportOffsetTop: next.visualViewportOffsetTop,
        effectiveViewportBottom: next.effectiveViewportBottom,
        keyboardOcclusionInset: next.keyboardOcclusionInset,
        safeBottom: next.safeBottom,
        effectiveBottomInset: next.effectiveBottomInset,
        runtimeContext: next.runtimeContext,
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
