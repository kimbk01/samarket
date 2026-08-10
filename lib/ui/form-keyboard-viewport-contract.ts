/**
 * DIBAY Form keyboard / visual-viewport SSOT (TYPE B — multi-field forms).
 *
 * CM Room (TYPE A Composer) stays on `cm-room-visible-viewport-contract` + LOCK.
 * This module shares the same *concepts* (vv height, no safe+keyboard double count)
 * but must not import or mutate CM room shell code.
 *
 * effectiveBottomInset is the only padding-bottom consumers may apply.
 * Never add `var(--safe-bottom)` on top of it.
 */

export const FORM_KEYBOARD_LAYOUT_ALIGNED_SLACK_PX = 28;
export const FORM_KEYBOARD_MIN_OCCLUSION_PX = 24;
/** Closed→open shrink threshold (nav chrome noise), same order as CM nav gap. */
export const FORM_KEYBOARD_NAVIGATION_GAP_PX = 48;
export const FORM_FOCUS_GAP_PX = 8;
export const FORM_VIEWPORT_MIN_PX = 240;

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
   */
  effectiveBottomInset: number;
};

export type FormKeyboardViewportBuildArgs = {
  baselineClosedHeightPx: number;
  /** From `window.samarketShell` when present; ignored when layout already resized. */
  nativeShellInsetPx?: number | null;
  safeBottomPx?: number;
  layoutAlignedSlackPx?: number;
  minOcclusionPx?: number;
};

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
  minOcclusionPx = FORM_KEYBOARD_MIN_OCCLUSION_PX
): boolean {
  const overlayGapPx = resolveFormVisualViewportOverlayGapPx();
  if (overlayGapPx >= minOcclusionPx) return true;

  const frame = resolveFormVisualViewportFrame();
  if (
    baselineClosedHeightPx > 0 &&
    frame.heightPx <= baselineClosedHeightPx - FORM_KEYBOARD_NAVIGATION_GAP_PX
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

export function buildFormKeyboardViewportSnapshot(
  args: FormKeyboardViewportBuildArgs
): FormKeyboardViewportSnapshot & { baselineClosedHeightPx: number } {
  const frame = resolveFormVisualViewportFrame();
  const keyboardOcclusionInset = resolveFormKeyboardOcclusionInsetPx({
    nativeShellInsetPx: args.nativeShellInsetPx,
    layoutAlignedSlackPx: args.layoutAlignedSlackPx,
    minOcclusionPx: args.minOcclusionPx,
  });
  const keyboardOpen = resolveFormKeyboardOpenFromViewport(
    args.baselineClosedHeightPx,
    args.minOcclusionPx ?? FORM_KEYBOARD_MIN_OCCLUSION_PX
  );
  const safeBottom =
    typeof args.safeBottomPx === "number" && Number.isFinite(args.safeBottomPx)
      ? Math.max(0, Math.round(args.safeBottomPx))
      : readCssSafeBottomPx();

  const nextBaseline = keyboardOpen
    ? args.baselineClosedHeightPx
    : Math.max(args.baselineClosedHeightPx, frame.heightPx);

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
    baselineClosedHeightPx: nextBaseline,
  };
}

/**
 * Minimal scroll so focused control sits above effective viewport bottom.
 * No-op when already visible. Never uses scrollIntoView(center).
 */
export function ensureFormFocusVisibleInScrollRoot(args: {
  focused: HTMLElement;
  scrollRoot: HTMLElement | null;
  effectiveViewportBottom: number;
  focusGapPx?: number;
}): number {
  const gap = args.focusGapPx ?? FORM_FOCUS_GAP_PX;
  const limit = args.effectiveViewportBottom - gap;
  const rect = args.focused.getBoundingClientRect();
  if (rect.bottom <= limit) return 0;

  const delta = Math.ceil(rect.bottom - limit);
  if (delta <= 0) return 0;

  const root = args.scrollRoot;
  if (root && typeof root.scrollTop === "number") {
    root.scrollTop += delta;
    return delta;
  }
  if (typeof window !== "undefined") {
    window.scrollBy(0, delta);
    return delta;
  }
  return 0;
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
