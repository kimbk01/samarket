"use client";

import { useEffect, type RefObject } from "react";
import {
  ensureFormFocusVisibleInScrollRoot,
  findFormScrollRoot,
  FORM_FOCUS_GAP_PX,
} from "@/lib/ui/form-keyboard-viewport-contract";

type Options = {
  enabled?: boolean;
  /** Scroll container (form body). Falls back to nearest overflow ancestor. */
  scrollRootRef?: RefObject<HTMLElement | null>;
  /** From Form keyboard SSOT — layout Y of last visible pixel. */
  effectiveViewportBottom: number;
  focusGapPx?: number;
};

function isTextEntryTarget(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/**
 * focusin / input growth: scroll only when focused control is below effective viewport.
 * Never scrollIntoView(center).
 */
export function useFormKeyboardFocusVisibility(opts: Options): void {
  const enabled = opts.enabled !== false;
  const bottom = opts.effectiveViewportBottom;
  const gap = opts.focusGapPx ?? FORM_FOCUS_GAP_PX;
  const scrollRootRef = opts.scrollRootRef;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    if (!(bottom > 0)) return;

    const run = (focused: HTMLElement) => {
      const root = scrollRootRef?.current ?? findFormScrollRoot(focused);
      ensureFormFocusVisibleInScrollRoot({
        focused,
        scrollRoot: root,
        effectiveViewportBottom: bottom,
        focusGapPx: gap,
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntryTarget(e.target)) return;
      const focused = e.target as HTMLElement;
      const boundRoot = scrollRootRef?.current;
      if (boundRoot && !boundRoot.contains(focused)) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => run(focused));
      });
    };

    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [enabled, bottom, gap, scrollRootRef]);
}
