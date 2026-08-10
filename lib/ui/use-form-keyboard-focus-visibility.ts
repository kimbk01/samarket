"use client";

import { useEffect, useRef, type RefObject } from "react";
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
 * `effectiveViewportBottom` is read from a ref so keyboard open does not tear
 * down listeners (and drop active focus). Settle retries cover Android resize
 * reflow that can reset scrollTop after the first correction.
 */
export function useFormKeyboardFocusVisibility(opts: Options): void {
  const enabled = opts.enabled !== false;
  const bottom = opts.effectiveViewportBottom;
  const gap = opts.focusGapPx ?? FORM_FOCUS_GAP_PX;
  const scrollRootRef = opts.scrollRootRef;
  const stickyChromeRef = opts.stickyChromeRef;

  const bottomRef = useRef(bottom);
  bottomRef.current = bottom;
  const gapRef = useRef(gap);
  gapRef.current = gap;
  const activeFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let resizeRo: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;
    const settleTimers: number[] = [];

    const clearSettle = () => {
      for (const id of settleTimers) window.clearTimeout(id);
      settleTimers.length = 0;
    };

    const run = (focused: HTMLElement) => {
      const bandBottom = bottomRef.current;
      if (!(bandBottom > 0)) return;
      const root = scrollRootRef?.current ?? findFormScrollRoot(focused);
      const stickyFromDom =
        stickyChromeRef?.current ??
        root?.closest("[data-form-keyboard-surface]")?.querySelector<HTMLElement>(
          "[data-form-keyboard-sticky-chrome]"
        ) ??
        null;
      const effectiveViewportTop = resolveFormEffectiveViewportTopPx({
        stickyChromeEl: stickyFromDom,
        effectiveViewportBottom: bandBottom,
        focusedHeightPx: resolveFocusedBandHeightPx(focused),
      });
      ensureFormFocusVisibleInScrollRoot({
        focused,
        scrollRoot: root,
        effectiveViewportBottom: bandBottom,
        effectiveViewportTop,
        focusGapPx: gapRef.current,
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
      clearSettle();
      const kick = () => {
        if (activeFocusedRef.current !== focused || !document.contains(focused)) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => run(focused));
        });
      };
      kick();
      // Android WebView resize can reflow and reset scrollTop after the first
      // correction — re-apply while the same control stays focused.
      for (const ms of [50, 150, 320]) {
        settleTimers.push(window.setTimeout(kick, ms));
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntryTarget(e.target)) return;
      const focused = e.target as HTMLElement;
      const boundRoot = scrollRootRef?.current;
      if (boundRoot && !boundRoot.contains(focused)) return;
      activeFocusedRef.current = focused;
      observeGrowth(focused);
      scheduleRun(focused);
    };

    const onFocusOut = () => {
      activeFocusedRef.current = null;
      clearSettle();
      resizeRo?.disconnect();
      resizeRo = null;
      observed = null;
    };

    const onViewportGeometry = () => {
      const focused = activeFocusedRef.current;
      if (!focused || !document.contains(focused)) return;
      scheduleRun(focused);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportGeometry);
    vv?.addEventListener("scroll", onViewportGeometry);
    window.addEventListener("resize", onViewportGeometry);
    window.addEventListener("orientationchange", onViewportGeometry);

    const existing = document.activeElement;
    if (isTextEntryTarget(existing)) {
      const boundRoot = scrollRootRef?.current;
      if (!boundRoot || boundRoot.contains(existing)) {
        activeFocusedRef.current = existing;
        observeGrowth(existing);
        scheduleRun(existing);
      }
    }

    return () => {
      clearSettle();
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      vv?.removeEventListener("resize", onViewportGeometry);
      vv?.removeEventListener("scroll", onViewportGeometry);
      window.removeEventListener("resize", onViewportGeometry);
      window.removeEventListener("orientationchange", onViewportGeometry);
      resizeRo?.disconnect();
    };
  }, [enabled, scrollRootRef, stickyChromeRef]);

  // Keyboard open/close updates band bottom without tearing listeners.
  useEffect(() => {
    if (!enabled || !(bottom > 0)) return;
    const focused =
      activeFocusedRef.current && document.contains(activeFocusedRef.current)
        ? activeFocusedRef.current
        : isTextEntryTarget(document.activeElement)
          ? document.activeElement
          : null;
    if (!focused) return;
    const boundRoot = scrollRootRef?.current;
    if (boundRoot && !boundRoot.contains(focused)) return;
    activeFocusedRef.current = focused;
    const timers = [0, 50, 150, 320].map((ms) =>
      window.setTimeout(() => {
        if (activeFocusedRef.current !== focused || !document.contains(focused)) return;
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
      }, ms)
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [enabled, bottom, gap, scrollRootRef, stickyChromeRef]);
}
