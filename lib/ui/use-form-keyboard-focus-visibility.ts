"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  ensureFormFocusVisibleInScrollRoot,
  ensureFormKeepVisibleCompanionInScrollRoot,
  findFormKeyboardKeepVisibleCompanion,
  findFormScrollRoot,
  FORM_FOCUS_GAP_PX,
  resolveFormEffectiveViewportTopPx,
  resolveFormFocusTargetRect,
  resolveFormVisualViewportFrame,
  restoreFormFocusOverscrollInScrollRoot,
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

function isInsideFormFooter(el: HTMLElement): boolean {
  return Boolean(el.closest("[data-form-keyboard-footer='1']"));
}

/** Prefer caret-line height for tall textareas (CASE D) — not full box; rich editor = caret line/block. */
function resolveFocusedBandHeightPx(focused: HTMLElement): number {
  const raw = Math.max(0, Math.round(resolveFormFocusTargetRect(focused).height));
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
/**
 * 포커스 입력과 같은 화면(가장 가까운 조상 범위)의 하단 고정 푸터 — 시트·페이지가 겹쳐도
 * 문서 첫 푸터가 아닌 자기 푸터 기준으로 가림을 계산 (KB-08).
 */
function findNearestFormKeyboardFooter(focused: Element): HTMLElement | null {
  const selector = "[data-form-keyboard-footer='1']";
  let scope: Element | null = focused.parentElement;
  while (scope) {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found) return found;
    scope = scope.parentElement;
  }
  return null;
}

/** K-07 — the field's own confirm button (`data-form-keyboard-keep-visible`) joins it above the keyboard. */
function revealCompanion(
  focused: HTMLElement,
  root: HTMLElement | null,
  bandBottom: number,
  effectiveViewportTop: number,
  gap: number
): void {
  const companion = findFormKeyboardKeepVisibleCompanion(focused);
  if (!companion) return;
  ensureFormKeepVisibleCompanionInScrollRoot({
    focused,
    companion,
    scrollRoot: root,
    effectiveViewportBottom: bandBottom,
    effectiveViewportTop,
    focusGapPx: gap,
  });
}

/** 포커스 보정이 이 입력칸에서 스크롤 영역을 내린 양 — 키보드 순간 높이로 내린 스크롤을 되돌리는 기준 */
export type OverscrollDebt = { root: HTMLElement | null; focused: HTMLElement | null; debtPx: number; expectedTop: number };

/**
 * 보이게 스크롤(`ensureFormFocusVisibleInScrollRoot`) 후, 그동안 보정이 내린 양 중 필요 없어진 만큼 되돌린다.
 * Android 앱 WebView 키보드 순간 높이(실측 115px) → 25px 내린 뒤 그대로 남던 결함(2026-11-02 · 커뮤니티 작성기 주제 줄 가림).
 * 사용자가 아래로 더 스크롤했으면 빚을 버린다 — 사용자 스크롤은 되돌리지 않는다. 위로 줄어든 만큼(사용자·브라우저 최대치 조정)은 빚에서 뺀다.
 */
export function correctFocusInScrollRoot(
  debt: OverscrollDebt,
  args: { focused: HTMLElement; root: HTMLElement | null; bandBottom: number; viewportTop: number; gap: number }
): void {
  const { focused, root, bandBottom, viewportTop, gap } = args;
  if (debt.root !== root || debt.focused !== focused) {
    debt.debtPx = 0;
  } else if (root) {
    // 마지막 기록 이후 위치 변화: 아래로 더 내려갔으면 사용자가 내린 것 → 빚을 버린다(되돌리면 사용자와 싸운다).
    // 위로 올라갔으면(사용자가 올렸거나, 스크롤 영역이 커져 브라우저가 최대치로 줄임 — 실측 60→31) 그만큼 이미 되돌려진 것.
    const moved = root.scrollTop - debt.expectedTop;
    if (moved > 1) debt.debtPx = 0;
    else if (moved < -1) debt.debtPx = Math.max(0, debt.debtPx + moved);
  }
  debt.root = root;
  debt.focused = focused;
  for (let i = 0; i < 3; i += 1) {
    const before = root ? root.scrollTop : 0;
    const applied = ensureFormFocusVisibleInScrollRoot({
      focused,
      scrollRoot: root,
      effectiveViewportBottom: bandBottom,
      effectiveViewportTop: viewportTop,
      focusGapPx: gap,
    });
    if (root) debt.debtPx = Math.max(0, debt.debtPx + (root.scrollTop - before));
    if (applied === 0) break;
  }
  if (root && debt.debtPx > 0) {
    debt.debtPx -= restoreFormFocusOverscrollInScrollRoot({
      focused,
      scrollRoot: root,
      effectiveViewportBottom: bandBottom,
      effectiveViewportTop: viewportTop,
      focusGapPx: gap,
      debtPx: debt.debtPx,
    });
  }
  if (root) debt.expectedTop = root.scrollTop;
}

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
  const overscrollDebtRef = useRef<OverscrollDebt>({ root: null, focused: null, debtPx: 0, expectedTop: 0 });

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let resizeRo: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;
    const settleTimers: number[] = [];

    const clearSettle = () => {
      for (const id of settleTimers) window.clearTimeout(id);
      settleTimers.length = 0;
    };

    const resolveLiveBandBottomPx = () => {
      const live = resolveFormVisualViewportFrame().visualBottomPx;
      if (!(live > 0)) return bottomRef.current;
      // React snap can lag one frame behind Android adjustResize — never use a
      // stale taller band or landscape focus stays below the IME.
      const fromSnap = bottomRef.current > 0 ? bottomRef.current : live;
      let bandBottom = Math.min(fromSnap, live);
      const focused = activeFocusedRef.current;
      // KB-08 — 포커스 입력과 같은 범위의 푸터 (겹친 시트·페이지에서 문서 첫 푸터 오판 금지)
      const footer = focused ? findNearestFormKeyboardFooter(focused) : null;
      if (footer && focused && !footer.contains(focused)) {
        const footerTop = Math.round(footer.getBoundingClientRect().top);
        if (Number.isFinite(footerTop) && footerTop > 0) {
          bandBottom = Math.min(bandBottom, footerTop);
        }
      }
      return bandBottom;
    };

    const run = (focused: HTMLElement) => {
      const bandBottom = resolveLiveBandBottomPx();
      if (!(bandBottom > 0)) return;
      const root =
        (scrollRootRef?.current &&
        scrollRootRef.current.isConnected &&
        scrollRootRef.current.scrollHeight > scrollRootRef.current.clientHeight + 1
          ? scrollRootRef.current
          : null) ?? findFormScrollRoot(focused);
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
      // Resize reflow can leave one correction short — iterate while still occluded; then undo transient over-scroll.
      correctFocusInScrollRoot(overscrollDebtRef.current, {
        focused,
        root,
        bandBottom,
        viewportTop: effectiveViewportTop,
        gap: gapRef.current,
      });
      revealCompanion(focused, root, bandBottom, effectiveViewportTop, gapRef.current);
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
      // Sticky footer fields are kept visible by the footer/padding authority.
      if (isInsideFormFooter(focused)) return;
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
      if (isInsideFormFooter(existing)) return;
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
        const live = resolveFormVisualViewportFrame().visualBottomPx;
        let bandBottom = Math.min(bottom, live > 0 ? live : bottom);
        const footer = findNearestFormKeyboardFooter(focused);
        if (footer && !footer.contains(focused)) {
          const footerTop = Math.round(footer.getBoundingClientRect().top);
          if (Number.isFinite(footerTop) && footerTop > 0) {
            bandBottom = Math.min(bandBottom, footerTop);
          }
        }
        if (!(bandBottom > 0)) return;
        const root =
          (scrollRootRef?.current &&
          scrollRootRef.current.isConnected &&
          scrollRootRef.current.scrollHeight > scrollRootRef.current.clientHeight + 1
            ? scrollRootRef.current
            : null) ?? findFormScrollRoot(focused);
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
        correctFocusInScrollRoot(overscrollDebtRef.current, {
          focused,
          root,
          bandBottom,
          viewportTop: effectiveViewportTop,
          gap,
        });
        revealCompanion(focused, root, bandBottom, effectiveViewportTop, gap);
      }, ms)
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [enabled, bottom, gap, scrollRootRef, stickyChromeRef]);
}
