/**
 * DIBAY Form keyboard / visual-viewport SSOT (TYPE B — multi-field forms).
 *
 * HARD LOCK: `docs/dibay-global-input-ux-parity-hard-lock.md`
 * ONE PRODUCT CONTRACT ≠ ONE GEOMETRY FORMULA — platform adapters live in
 * `form-keyboard-platform-adapter.ts`. Normalized field *names* are shared;
 * raw inset/keyboard/safe/nav/orientation math is **not**.
 *
 * CM Room (TYPE A Composer) stays on `cm-room-visible-viewport-contract` + LOCK.
 * This module shares the same *concepts* (vv height, no safe+keyboard double count)
 * but must not import or mutate CM room shell code.
 *
 * effectiveBottomInset is the only padding-bottom consumers may apply.
 * Never add `var(--safe-bottom)` on top of it.
 * Never interpret effectiveBottomInset as “one shared px across devices.”
 */

import type { FormKeyboardRuntimeContext } from "@/lib/ui/form-keyboard-platform-adapter";

export const FORM_KEYBOARD_LAYOUT_ALIGNED_SLACK_PX = 28;
export const FORM_KEYBOARD_MIN_OCCLUSION_PX = 24;
/** Closed→open shrink threshold (nav chrome noise), same order as CM nav gap. */
export const FORM_KEYBOARD_NAVIGATION_GAP_PX = 48;
export const FORM_FOCUS_GAP_PX = 8;
/**
 * Minimum usable band (bottom - top) before CASE D relaxes sticky chrome.
 * Landscape + IME often leaves ~100px; chrome must not consume the focus band.
 */
export const FORM_FOCUS_MIN_USABLE_BAND_PX = 120;
export const FORM_VIEWPORT_MIN_PX = 240;

/** Shared pressed visual — CSS :active only; respects prefers-reduced-motion via motion-reduce. */
export const FORM_INTERACTIVE_PRESS_CLASS =
  "touch-manipulation transition-[transform,filter,opacity] duration-100 active:scale-[0.985] active:brightness-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

export type FormKeyboardViewportSnapshot = {
  keyboardOpen: boolean;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
  /** Layout Y of the last visible pixel (offsetTop + height). */
  effectiveViewportBottom: number;
  /** IME occlusion only — 0 when layout already resized (Android adjustResize). */
  keyboardOcclusionInset: number;
  safeBottom: number;
  /**
   * Footer / sticky CTA `padding-bottom` authority.
   * closed → safeBottom; open → keyboardOcclusionInset only (never safe+keyboard).
   * Value is adapter-local for this environment — not a global constant.
   */
  effectiveBottomInset: number;
  /** Capability / orientation labels for matrix rows (nav mode never UA-guessed). */
  runtimeContext?: FormKeyboardRuntimeContext;
};

export type FormKeyboardViewportBuildArgs = {
  baselineClosedHeightPx: number;
  /**
   * Layout width when `baselineClosedHeightPx` was taken. A different current width
   * (rotation · split-screen · window resize) re-baselines — portrait geometry is never reused
   * in landscape (input parity HARD LOCK DO NOT "Reuse portrait→landscape geometry", KB-04).
   */
  baselineLayoutWidthPx?: number;
  /** From `window.samarketShell` when present; ignored when layout already resized. */
  nativeShellInsetPx?: number | null;
  safeBottomPx?: number;
  layoutAlignedSlackPx?: number;
  minOcclusionPx?: number;
  /**
   * When set (platform adapter path), skips bare `resolveFormKeyboardOcclusionInsetPx`.
   * Desktop physical KB / model `none` passes 0 here.
   */
  keyboardOcclusionInsetOverride?: number;
  /** Matrix labels — optional; never invent gesture vs 3-button. */
  runtimeContext?: FormKeyboardRuntimeContext;
  /**
   * Is a control that can raise an OS input surface focused (`isFormKeyboardInputSurfaceElement`)?
   * Necessary — never sufficient — for "open": no such focus → closed and the closed baseline is
   * re-measured from the current viewport (non-keyboard resize: split / multi-window, defect B).
   * Omitted = legacy (no gate).
   */
  inputSurfaceFocused?: boolean;
  /**
   * Baseline carried across a rotation with the keyboard open (`resolveFormKeyboardBaselineOnWidthChange`).
   * Open needs a larger shrink (`FORM_KEYBOARD_ESTIMATED_BASELINE_SHRINK_RATIO`); the first closed
   * measurement replaces it with the measured height (defect A — never left pending).
   */
  baselineEstimated?: boolean;
  /**
   * Native proof the IME is hidden (`readAndroidNativeImeHiddenEvidence`). true → closed, baseline
   * re-measured. false/omitted = no proof either way (never treated as "open").
   */
  nativeImeHidden?: boolean;
};

/** Capacitor 8 core `SystemBars` (Android) writes this on <html> from WindowInsets on every insets pass. */
export const CAPACITOR_SAFE_AREA_BOTTOM_VAR = "--safe-area-inset-bottom";

/**
 * Android only — existing native signal, read-only (no plugin / config change):
 * Capacitor `SystemBars.calcSafeAreaInsets` sets the bottom inset to 0 while the IME is visible and to
 * the system-bar bottom otherwise. So a value > 0 PROVES the IME is hidden. 0 proves nothing
 * (IME up, side / hidden navigation bar, or the non-passthrough branch that always writes 0).
 */
export function readAndroidNativeImeHiddenEvidence(rootStyle: {
  getPropertyValue: (name: string) => string;
} | null): boolean {
  if (!rootStyle) return false;
  const px = Number.parseFloat(rootStyle.getPropertyValue(CAPACITOR_SAFE_AREA_BOTTOM_VAR));
  return Number.isFinite(px) && px > 0;
}

/** Probe `--safe-bottom` resolved px (env + native bridge). */
export function readCssSafeBottomPx(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;bottom:0;left:0;width:0;height:0;padding-bottom:var(--safe-bottom);visibility:hidden;pointer-events:none";
  document.documentElement.appendChild(probe);
  const raw = getComputedStyle(probe).paddingBottom;
  probe.remove();
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? Math.max(0, Math.round(px)) : 0;
}

export function resolveFormVisualViewportFrame(minHeightPx = FORM_VIEWPORT_MIN_PX): {
  heightPx: number;
  offsetTopPx: number;
  visualBottomPx: number;
} {
  if (typeof window === "undefined") {
    return { heightPx: minHeightPx, offsetTopPx: 0, visualBottomPx: minHeightPx };
  }
  const vv = window.visualViewport;
  if (!vv) {
    const heightPx = Math.max(minHeightPx, Math.round(window.innerHeight));
    return { heightPx, offsetTopPx: 0, visualBottomPx: heightPx };
  }
  const heightPx = Math.max(minHeightPx, Math.round(vv.height));
  const offsetTopPx = Math.max(0, Math.round(vv.offsetTop));
  return { heightPx, offsetTopPx, visualBottomPx: offsetTopPx + heightPx };
}

export function resolveFormVisualViewportOverlayGapPx(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
}

/**
 * True when layout viewport bottom already tracks visual viewport
 * (Android adjustResize / interactiveWidget=resizes-content / dvh shrink).
 */
export function isFormLayoutAlignedWithVisualViewport(
  layoutAlignedSlackPx = FORM_KEYBOARD_LAYOUT_ALIGNED_SLACK_PX
): boolean {
  if (typeof window === "undefined") return true;
  const vv = window.visualViewport;
  if (!vv) return true;
  const vvBottom = vv.height + vv.offsetTop;
  return window.innerHeight <= vvBottom + layoutAlignedSlackPx;
}

/**
 * Occlusion inset for Form footers.
 * Layout already resized → 0 (never re-apply keyboard height as padding).
 */
export function resolveFormKeyboardOcclusionInsetPx(args?: {
  nativeShellInsetPx?: number | null;
  layoutAlignedSlackPx?: number;
  minOcclusionPx?: number;
}): number {
  const layoutAlignedSlackPx = args?.layoutAlignedSlackPx ?? FORM_KEYBOARD_LAYOUT_ALIGNED_SLACK_PX;
  const minOcclusionPx = args?.minOcclusionPx ?? FORM_KEYBOARD_MIN_OCCLUSION_PX;

  if (typeof window === "undefined") return 0;

  if (isFormLayoutAlignedWithVisualViewport(layoutAlignedSlackPx)) {
    return 0;
  }

  const native = args?.nativeShellInsetPx;
  if (typeof native === "number" && Number.isFinite(native) && native >= minOcclusionPx) {
    return Math.round(native);
  }

  const gap = resolveFormVisualViewportOverlayGapPx();
  return gap >= minOcclusionPx ? gap : 0;
}

export function resolveFormKeyboardOpenFromViewport(
  baselineClosedHeightPx: number,
  minOcclusionPx = FORM_KEYBOARD_MIN_OCCLUSION_PX,
  shrinkThresholdPx = FORM_KEYBOARD_NAVIGATION_GAP_PX
): boolean {
  const overlayGapPx = resolveFormVisualViewportOverlayGapPx();
  if (overlayGapPx >= minOcclusionPx) return true;

  const frame = resolveFormVisualViewportFrame();
  if (
    baselineClosedHeightPx > 0 &&
    frame.heightPx <= baselineClosedHeightPx - shrinkThresholdPx
  ) {
    return true;
  }

  return false;
}

/**
 * Single bottom padding authority — consumers must not add safe-bottom again.
 */
export function resolveFormEffectiveBottomInsetPx(args: {
  keyboardOpen: boolean;
  keyboardOcclusionInset: number;
  safeBottom: number;
}): number {
  if (args.keyboardOpen) {
    return Math.max(0, Math.round(args.keyboardOcclusionInset));
  }
  return Math.max(0, Math.round(args.safeBottom));
}

/** Current layout viewport width (0 on server). */
export function resolveFormLayoutWidthPx(): number {
  if (typeof window === "undefined") return 0;
  return Math.round(window.innerWidth);
}

/**
 * Baseline for this layout width: a width change means a new geometry (rotation / split) —
 * restart from the current visual height instead of the previous orientation's height.
 */
export function resolveFormKeyboardBaselineForLayout(args: {
  baselineClosedHeightPx: number;
  baselineLayoutWidthPx?: number;
  layoutWidthPx: number;
  frameHeightPx: number;
}): number {
  if (
    typeof args.baselineLayoutWidthPx === "number" &&
    args.baselineLayoutWidthPx > 0 &&
    args.layoutWidthPx > 0 &&
    args.baselineLayoutWidthPx !== args.layoutWidthPx
  ) {
    return args.frameHeightPx;
  }
  return args.baselineClosedHeightPx;
}

/** Shrink (fraction of the estimated closed height) that counts as "open" right after a rotation. */
export const FORM_KEYBOARD_ESTIMATED_BASELINE_SHRINK_RATIO = 0.2;

/**
 * Closed baseline for a new layout width (rotation · split resize).
 * - width seen before → its measured closed height;
 * - keyboard open across the change (Android resize) → estimate from the previous orientation's
 *   measured geometry: the chrome that was subtracted from the long side is subtracted from the
 *   short side (`prevBaseline + prevWidth − width`). Never a device constant.
 * - otherwise → the current viewport height (keyboard closed: exact).
 */
export function resolveFormKeyboardBaselineOnWidthChange(args: {
  layoutWidthPx: number;
  frameHeightPx: number;
  knownClosedHeightPx?: number | null;
  prevBaselineClosedHeightPx: number;
  prevBaselineLayoutWidthPx: number;
  prevBaselineEstimated: boolean;
  wasKeyboardOpen: boolean;
  inputSurfaceFocused: boolean;
}): { baselineClosedHeightPx: number; baselineEstimated: boolean } {
  if (typeof args.knownClosedHeightPx === "number" && args.knownClosedHeightPx > 0) {
    return { baselineClosedHeightPx: args.knownClosedHeightPx, baselineEstimated: false };
  }
  if (
    args.wasKeyboardOpen &&
    args.inputSurfaceFocused &&
    !args.prevBaselineEstimated &&
    args.prevBaselineClosedHeightPx > 0 &&
    args.prevBaselineLayoutWidthPx > 0
  ) {
    const estimate = Math.round(
      args.prevBaselineClosedHeightPx + args.prevBaselineLayoutWidthPx - args.layoutWidthPx
    );
    if (estimate > args.frameHeightPx) {
      return { baselineClosedHeightPx: estimate, baselineEstimated: true };
    }
  }
  return { baselineClosedHeightPx: args.frameHeightPx, baselineEstimated: false };
}

type InputSurfaceCandidate = {
  tagName?: string;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
  isContentEditable?: boolean;
  isConnected?: boolean;
  getAttribute?: (name: string) => string | null;
};

const NON_INPUT_SURFACE_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Focused control that can raise an OS input surface (soft keyboard, iOS picker for select/date,
 * or an unknown one inside an iframe). Broader than "text keyboard" on purpose: footers must still
 * clear an iOS picker. Gate only — focus never proves the keyboard is shown.
 */
export function isFormKeyboardInputSurfaceElement(
  el: InputSurfaceCandidate | null | undefined
): boolean {
  if (!el || typeof el !== "object") return false;
  if (el.disabled === true || el.isConnected === false) return false;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "IFRAME" || tag === "SELECT") return true;
  if (typeof el.getAttribute === "function") {
    const mode = el.getAttribute("inputmode");
    if (mode != null && mode.trim().toLowerCase() === "none") return false;
  }
  if (tag === "TEXTAREA") return el.readOnly !== true;
  if (tag === "INPUT") {
    if (el.readOnly === true) return false;
    const raw =
      typeof el.type === "string"
        ? el.type
        : typeof el.getAttribute === "function"
          ? el.getAttribute("type") ?? ""
          : "";
    return !NON_INPUT_SURFACE_INPUT_TYPES.has(raw.trim().toLowerCase());
  }
  return el.isContentEditable === true;
}

export function buildFormKeyboardViewportSnapshot(
  args: FormKeyboardViewportBuildArgs
): FormKeyboardViewportSnapshot & { baselineClosedHeightPx: number; baselineLayoutWidthPx: number } {
  const frame = resolveFormVisualViewportFrame();
  const layoutWidthPx = resolveFormLayoutWidthPx();
  const baselineClosedHeightPx = resolveFormKeyboardBaselineForLayout({
    baselineClosedHeightPx: args.baselineClosedHeightPx,
    baselineLayoutWidthPx: args.baselineLayoutWidthPx,
    layoutWidthPx,
    frameHeightPx: frame.heightPx,
  });
  const keyboardOcclusionInset =
    typeof args.keyboardOcclusionInsetOverride === "number" &&
    Number.isFinite(args.keyboardOcclusionInsetOverride)
      ? Math.max(0, Math.round(args.keyboardOcclusionInsetOverride))
      : resolveFormKeyboardOcclusionInsetPx({
          nativeShellInsetPx: args.nativeShellInsetPx,
          layoutAlignedSlackPx: args.layoutAlignedSlackPx,
          minOcclusionPx: args.minOcclusionPx,
        });
  const shrinkThresholdPx = args.baselineEstimated
    ? Math.max(
        FORM_KEYBOARD_NAVIGATION_GAP_PX,
        Math.round(baselineClosedHeightPx * FORM_KEYBOARD_ESTIMATED_BASELINE_SHRINK_RATIO)
      )
    : FORM_KEYBOARD_NAVIGATION_GAP_PX;
  const keyboardOpen =
    args.runtimeContext?.keyboardModel === "none" ||
    args.inputSurfaceFocused === false ||
    args.nativeImeHidden === true
      ? false
      : resolveFormKeyboardOpenFromViewport(
          baselineClosedHeightPx,
          args.minOcclusionPx ?? FORM_KEYBOARD_MIN_OCCLUSION_PX,
          shrinkThresholdPx
        );
  const safeBottom =
    typeof args.safeBottomPx === "number" && Number.isFinite(args.safeBottomPx)
      ? Math.max(0, Math.round(args.safeBottomPx))
      : args.runtimeContext?.safeBottomPx != null
        ? Math.max(0, Math.round(args.runtimeContext.safeBottomPx))
        : readCssSafeBottomPx();

  // Closed: grow-only while an input is focused (keyboard may still be animating);
  // re-measured exactly when nothing can hold a keyboard or the baseline was only estimated.
  const nextBaseline = keyboardOpen
    ? baselineClosedHeightPx
    : args.inputSurfaceFocused === false || args.baselineEstimated || args.nativeImeHidden === true
      ? frame.heightPx
      : Math.max(baselineClosedHeightPx, frame.heightPx);

  return {
    keyboardOpen,
    visualViewportHeight: frame.heightPx,
    visualViewportOffsetTop: frame.offsetTopPx,
    effectiveViewportBottom: frame.visualBottomPx,
    keyboardOcclusionInset,
    safeBottom,
    effectiveBottomInset: resolveFormEffectiveBottomInsetPx({
      keyboardOpen,
      keyboardOcclusionInset,
      safeBottom,
    }),
    runtimeContext: args.runtimeContext,
    baselineClosedHeightPx: nextBaseline,
    baselineLayoutWidthPx: layoutWidthPx,
  };
}

/**
 * Visible band top in layout Y — visualViewport.offsetTop, optionally raised to sticky chrome bottom.
 * Do not invent page-specific px offsets or device-name branches.
 *
 * CASE D (tiny usable viewport, e.g. landscape + keyboard): if chrome would leave
 * less space than the focused control needs, relax top toward vv.offsetTop just enough
 * to fit — focus visibility wins over keeping full sticky chrome in the band.
 */
export function resolveFormEffectiveViewportTopPx(args?: {
  stickyChromeEl?: HTMLElement | null;
  effectiveViewportBottom?: number;
  /** Focused control height (textarea: pass caret-line estimate, not full scroll height). */
  focusedHeightPx?: number;
}): number {
  const frame = resolveFormVisualViewportFrame();
  let topPx = frame.offsetTopPx;
  const chrome = args?.stickyChromeEl;
  if (chrome) {
    const bottom = Math.round(chrome.getBoundingClientRect().bottom);
    if (Number.isFinite(bottom)) topPx = Math.max(topPx, bottom);
  }

  const bandBottom = args?.effectiveViewportBottom ?? frame.visualBottomPx;
  const focusedNeed = Math.max(0, Math.round(args?.focusedHeightPx ?? 0));
  const minUsable = Math.max(
    FORM_FOCUS_MIN_USABLE_BAND_PX,
    focusedNeed + FORM_FOCUS_GAP_PX * 2
  );
  const usable = bandBottom - topPx;
  /**
   * Only relax the top floor when there is no opaque sticky chrome.
   * Relaxing under sheet/header chrome marks caret as "visible" while it is
   * still covered (Trade landscape multiline).
   */
  if (
    !chrome &&
    focusedNeed > 0 &&
    usable < minUsable &&
    bandBottom > frame.offsetTopPx
  ) {
    const relaxedFloor = frame.offsetTopPx;
    const fitTop = bandBottom - minUsable;
    topPx = Math.max(relaxedFloor, Math.min(topPx, fitTop));
  }

  return Math.max(0, topPx);
}

/**
 * Minimal scroll so focused control stays in the visible band.
 * Bottom occluded → scroll down by occlusion only.
 * Top clipped → scroll up by clip only.
 * Already visible → NO SCROLL.
 * Tall control (height > usable band, e.g. multiline textarea in landscape+IME):
 * prioritize bottom/caret region — allow top clip (CASE D).
 * Never uses scrollIntoView(center).
 */
export function ensureFormFocusVisibleInScrollRoot(args: {
  focused: HTMLElement;
  scrollRoot: HTMLElement | null;
  effectiveViewportBottom: number;
  /** Defaults to visualViewport.offsetTop (0 on most Android resize). */
  effectiveViewportTop?: number;
  focusGapPx?: number;
}): number {
  const gap = args.focusGapPx ?? FORM_FOCUS_GAP_PX;
  let topLimit = (args.effectiveViewportTop ?? 0) + gap;
  let bottomLimit = args.effectiveViewportBottom - gap;

  // Degenerate band after keyboard+chrome — still keep focused top edge in view.
  if (!(bottomLimit > topLimit)) {
    topLimit = Math.max(0, args.effectiveViewportTop ?? 0);
    bottomLimit = Math.max(topLimit + 1, args.effectiveViewportBottom);
  }

  const rect = args.focused.getBoundingClientRect();
  const usable = bottomLimit - topLimit;
  const tallerThanBand = rect.height > usable + 1;
  let delta = 0;

  if (tallerThanBand) {
    // CASE D — keep caret/end region in band; do not require the full box above chrome.
    const caretH = Math.min(48, Math.max(24, Math.floor(usable * 0.35)));
    const caretFloor = topLimit + caretH;
    const caretTop = rect.bottom - Math.min(48, Math.max(0, rect.height));
    if (rect.bottom > bottomLimit) {
      delta = Math.ceil(rect.bottom - bottomLimit);
    } else if (rect.bottom < caretFloor) {
      delta = Math.floor(rect.bottom - caretFloor);
    } else if (caretTop + 0.5 < topLimit) {
      // Caret line still under sticky chrome — ease content down (negative delta).
      delta = Math.floor(caretTop - topLimit);
    } else {
      return 0;
    }
  } else if (rect.bottom > bottomLimit) {
    delta = Math.ceil(rect.bottom - bottomLimit);
  } else if (rect.top < topLimit) {
    delta = Math.floor(rect.top - topLimit);
  } else {
    return 0;
  }
  if (delta === 0) return 0;

  const root = args.scrollRoot;
  let applied = 0;
  if (root && typeof root.scrollTop === "number") {
    root.scrollTop += delta;
    applied = delta;
  } else if (typeof window !== "undefined") {
    window.scrollBy(0, delta);
    return delta;
  }

  /**
   * iOS WKWebView often scrolls the document / visualViewport on focus, not the
   * form overflow root. If the control is still outside the band, correct via
   * window.scrollBy (no-op on Android Cap when already in-band).
   */
  if (typeof window !== "undefined") {
    const rect2 = args.focused.getBoundingClientRect();
    let topLimit2 = (args.effectiveViewportTop ?? 0) + gap;
    let bottomLimit2 = args.effectiveViewportBottom - gap;
    if (!(bottomLimit2 > topLimit2)) {
      topLimit2 = Math.max(0, args.effectiveViewportTop ?? 0);
      bottomLimit2 = Math.max(topLimit2 + 1, args.effectiveViewportBottom);
    }
    const usable2 = bottomLimit2 - topLimit2;
    const taller2 = rect2.height > usable2 + 1;
    let delta2 = 0;
    if (taller2) {
      const caretH = Math.min(48, Math.max(24, Math.floor(usable2 * 0.35)));
      const caretFloor = topLimit2 + caretH;
      const caretTop = rect2.bottom - Math.min(48, Math.max(0, rect2.height));
      if (rect2.bottom > bottomLimit2) delta2 = Math.ceil(rect2.bottom - bottomLimit2);
      else if (rect2.bottom < caretFloor) delta2 = Math.floor(rect2.bottom - caretFloor);
      else if (caretTop + 0.5 < topLimit2) delta2 = Math.floor(caretTop - topLimit2);
    } else if (rect2.bottom > bottomLimit2) {
      delta2 = Math.ceil(rect2.bottom - bottomLimit2);
    } else if (rect2.top < topLimit2) {
      delta2 = Math.floor(rect2.top - topLimit2);
    }
    if (delta2 !== 0) {
      window.scrollBy(0, delta2);
      applied += delta2;
    }
  }
  return applied;
}

export function findFormScrollRoot(from: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = from;
  while (el) {
    const style = typeof window !== "undefined" ? getComputedStyle(el) : null;
    const oy = style?.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    if (el.dataset.formKeyboardScrollRoot === "1") return el;
    el = el.parentElement;
  }
  return null;
}

/** Button tied to the focused field (login · confirm) — kept above the keyboard with the field (K-07). */
export const FORM_KEYBOARD_KEEP_VISIBLE_SELECTOR = "[data-form-keyboard-keep-visible='1']";

/** Companion inside the focused field's own `<form>` only — never another surface's button. */
export function findFormKeyboardKeepVisibleCompanion(focused: HTMLElement): HTMLElement | null {
  const form = focused.closest("form");
  if (!form) return null;
  const el = form.querySelector<HTMLElement>(FORM_KEYBOARD_KEEP_VISIBLE_SELECTOR);
  return el && el !== focused && !el.contains(focused) ? el : null;
}

/**
 * After the focused field is in band: also bring its companion button's bottom into the band —
 * never moving the focused field's top above the band (small screens: the field wins and the
 * button stays reachable by scrolling). Returns applied delta.
 */
export function ensureFormKeepVisibleCompanionInScrollRoot(args: {
  focused: HTMLElement;
  companion: HTMLElement;
  scrollRoot: HTMLElement | null;
  effectiveViewportBottom: number;
  effectiveViewportTop?: number;
  focusGapPx?: number;
}): number {
  const gap = args.focusGapPx ?? FORM_FOCUS_GAP_PX;
  const topLimit = (args.effectiveViewportTop ?? 0) + gap;
  const bottomLimit = args.effectiveViewportBottom - gap;
  if (!(bottomLimit > topLimit)) return 0;
  const companionBottom = args.companion.getBoundingClientRect().bottom;
  const focusedTop = args.focused.getBoundingClientRect().top;
  const need = Math.ceil(companionBottom - bottomLimit);
  const room = Math.floor(focusedTop - topLimit);
  const delta = Math.min(need, room);
  if (!(delta > 0)) return 0;
  const root = args.scrollRoot;
  if (root && typeof root.scrollTop === "number" && root.scrollHeight > root.clientHeight + 1) {
    const before = root.scrollTop;
    root.scrollTop += delta;
    const applied = root.scrollTop - before;
    if (applied >= delta || typeof window === "undefined") return applied;
    window.scrollBy(0, delta - applied);
    return delta;
  }
  if (typeof window !== "undefined") {
    window.scrollBy(0, delta);
    return delta;
  }
  return 0;
}
