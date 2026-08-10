"use client";

import { useEffect, type RefObject } from "react";
import {
  ensureFormFocusVisibleInScrollRoot,
  findFormScrollRoot,
  FORM_FOCUS_GAP_PX,
  resolveFormEffectiveViewportTopPx,
} from "@/lib/ui/form-keyboard-viewport-contract";

type Options = {
  enabled?: boolean;
  /** Scroll container (form body). Falls back to nearest overflow ancestor. */
  scrollRootRef?: RefObject<HTMLElement | null>;
  /** Sticky/sheet chrome whose bottom raises the visible top (optional). */
  stickyChromeRef?: RefObject<HTMLElement | null>;
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
 * focusin / textarea growth: scroll only when focused control is outside the visible band
 * (bottom occlusion OR top clipping). Never scrollIntoView(center).
 */
export function useFormKeyboardFocusVisibility(opts: Options): void {
  const enabled = opts.enabled !== false;
  const bottom = opts.effectiveViewportBottom;
  const gap = opts.focusGapPx ?? FORM_FOCUS_GAP_PX;
  const scrollRootRef = opts.scrollRootRef;
  const stickyChromeRef = opts.stickyChromeRef;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    if (!(bottom > 0)) return;

    let resizeRo: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;

    const run = (focused: HTMLElement) => {
      const root = scrollRootRef?.current ?? findFormScrollRoot(focused);
      const stickyFromDom =
        stickyChromeRef?.current ??
        root?.closest("[data-form-keyboard-surface]")?.querySelector<HTMLElement>(
          "[data-form-keyboard-sticky-chrome]"
        ) ??
        null;
      const effectiveViewportTop = resolveFormEffectiveViewportTopPx({
        stickyChromeEl: stickyFromDom,
      });
      ensureFormFocusVisibleInScrollRoot({
        focused,
        scrollRoot: root,
        effectiveViewportBottom: bottom,
        effectiveViewportTop,
        focusGapPx: gap,
      });
    };

    const observeGrowth = (focused: HTMLElement) => {
      if (typeof ResizeObserver === "undefined") return;
      if (observed === focused) return;
      resizeRo?.disconnect();
      observed = focused;
      resizeRo = new ResizeObserver(() => run(focused));
      resizeRo.observe(focused);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntryTarget(e.target)) return;
      const focused = e.target as HTMLElement;
      const boundRoot = scrollRootRef?.current;
      if (boundRoot && !boundRoot.contains(focused)) return;
      observeGrowth(focused);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => run(focused));
      });
    };

    const onFocusOut = () => {
      resizeRo?.disconnect();
      resizeRo = null;
      observed = null;
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      resizeRo?.disconnect();
    };
  }, [enabled, bottom, gap, scrollRootRef, stickyChromeRef]);
}
