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

/** Prefer caret-line height for tall textareas (CASE D) — not full box. */
function resolveFocusedBandHeightPx(focused: HTMLElement): number {
  const rect = focused.getBoundingClientRect();
  const raw = Math.max(0, Math.round(rect.height));
  if (focused.tagName === "TEXTAREA") return Math.min(raw, 48);
  return raw;
}

/**
 * focusin / textarea growth / vv resize while focused:
 * scroll only when focused control is outside the visible band
 * (bottom occlusion OR top clipping). Never scrollIntoView(center).
 *
 * Re-runs on visualViewport resize so landscape keyboard open does not leave
 * a stale focus band from the pre-keyboard geometry.
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
    let activeFocused: HTMLElement | null = null;

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
        effectiveViewportBottom: bottom,
        focusedHeightPx: resolveFocusedBandHeightPx(focused),
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

    const scheduleRun = (focused: HTMLElement) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => run(focused));
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntryTarget(e.target)) return;
      const focused = e.target as HTMLElement;
      const boundRoot = scrollRootRef?.current;
      if (boundRoot && !boundRoot.contains(focused)) return;
      activeFocused = focused;
      observeGrowth(focused);
      scheduleRun(focused);
    };

    const onFocusOut = () => {
      activeFocused = null;
      resizeRo?.disconnect();
      resizeRo = null;
      observed = null;
    };

    const onViewportGeometry = () => {
      if (!activeFocused || !document.contains(activeFocused)) return;
      scheduleRun(activeFocused);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportGeometry);
    vv?.addEventListener("scroll", onViewportGeometry);
    window.addEventListener("resize", onViewportGeometry);
    window.addEventListener("orientationchange", onViewportGeometry);

    /**
     * When `effectiveViewportBottom` updates (keyboard open/close), this effect
     * re-subscribes and clears `activeFocused`. Re-bind the already-focused
     * control so landscape IME resize does not leave it below the band.
     */
    const existing = document.activeElement;
    if (isTextEntryTarget(existing)) {
      const boundRoot = scrollRootRef?.current;
      if (!boundRoot || boundRoot.contains(existing)) {
        activeFocused = existing;
        observeGrowth(existing);
        scheduleRun(existing);
      }
    }

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      vv?.removeEventListener("resize", onViewportGeometry);
      vv?.removeEventListener("scroll", onViewportGeometry);
      window.removeEventListener("resize", onViewportGeometry);
      window.removeEventListener("orientationchange", onViewportGeometry);
      resizeRo?.disconnect();
    };
  }, [enabled, bottom, gap, scrollRootRef, stickyChromeRef]);
}
