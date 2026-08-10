/**
 * DIBAY Form keyboard — platform / orientation / capability adapters.
 *
 * HARD LOCK: `docs/dibay-global-input-ux-parity-hard-lock.md`
 * ONE PRODUCT CONTRACT ≠ ONE GEOMETRY FORMULA.
 *
 * Adapters choose *which measured path* applies. They must not hardcode
 * Android 3-button px, iPhone home-indicator px, or reuse portrait→landscape values.
 * Gesture vs 3-button is **never** inferred from device/UA — only measured safe/layout.
 */

import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import {
  FORM_KEYBOARD_MIN_OCCLUSION_PX,
  isFormLayoutAlignedWithVisualViewport,
  readCssSafeBottomPx,
  resolveFormVisualViewportFrame,
  resolveFormVisualViewportOverlayGapPx,
} from "@/lib/ui/form-keyboard-viewport-contract";

export type FormKeyboardPlatformFamily = "android" | "ios" | "windows" | "web" | "unknown";

export type FormKeyboardFormFactor = "phone" | "tablet" | "desktop" | "unknown";

export type FormKeyboardOrientation = "portrait" | "landscape";

/**
 * JS cannot reliably distinguish Android gesture vs 3-button.
 * Runtime matrix rows must label nav mode from device settings / operator.
 */
export type FormKeyboardNavigationMode = "not_inferred";

/** Capability model — not OS name. */
export type FormKeyboardModel = "layout_resize" | "visual_overlay" | "none";

export type FormKeyboardRuntimeContext = {
  platformFamily: FormKeyboardPlatformFamily;
  formFactor: FormKeyboardFormFactor;
  orientation: FormKeyboardOrientation;
  navigationMode: FormKeyboardNavigationMode;
  keyboardModel: FormKeyboardModel;
  safeBottomPx: number;
  viewportWidth: number;
  viewportHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
};

function hasCoarseOrTouchPointer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches) return true;
    if (window.matchMedia?.("(any-pointer: coarse)").matches) return true;
  } catch {
    /* ignore */
  }
  return typeof navigator !== "undefined" && Number(navigator.maxTouchPoints) > 0;
}

function isLikelyWindowsUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Windows|Win64|WOW64/i.test(navigator.userAgent || "");
}

/**
 * Form factor hint from viewport — tablet ≠ phone geometry for matrix labeling.
 * Does not invent insets; consumers still use measured vv/safe.
 */
export function resolveFormKeyboardFormFactor(
  widthPx: number,
  heightPx: number
): FormKeyboardFormFactor {
  const short = Math.min(widthPx, heightPx);
  const long = Math.max(widthPx, heightPx);
  if (!(short > 0 && long > 0)) return "unknown";
  // Desktop-class: wide short side without coarse pointer handled by keyboardModel=none.
  if (short >= 600 && long >= 900) return "tablet";
  if (short >= 900) return "desktop";
  return "phone";
}

export function resolveFormKeyboardOrientation(
  widthPx: number,
  heightPx: number
): FormKeyboardOrientation {
  return widthPx > heightPx ? "landscape" : "portrait";
}

export function resolveFormKeyboardPlatformFamily(): FormKeyboardPlatformFamily {
  if (typeof window === "undefined") return "unknown";
  const shell = resolveCapacitorShellPlatform();
  if (shell === "android") return "android";
  if (shell === "ios") return "ios";
  if (isLikelyIosWebKit()) return "ios";
  if (isLikelyWindowsUa()) return "windows";
  return "web";
}

/**
 * Keyboard model from **capability**, never UA alone.
 * - layout already tracks vv → layout_resize (Android adjustResize / resizes-content)
 * - vv overlay gap → visual_overlay (typical iOS overlay)
 * - no touch + no overlay → none (desktop physical keyboard — no mobile reposition)
 */
export function resolveFormKeyboardModel(args?: {
  layoutAlignedSlackPx?: number;
  minOcclusionPx?: number;
}): FormKeyboardModel {
  const minOcclusionPx = args?.minOcclusionPx ?? FORM_KEYBOARD_MIN_OCCLUSION_PX;
  if (typeof window === "undefined") return "none";

  const gap = resolveFormVisualViewportOverlayGapPx();
  if (gap >= minOcclusionPx) return "visual_overlay";

  if (isFormLayoutAlignedWithVisualViewport(args?.layoutAlignedSlackPx)) {
    if (!hasCoarseOrTouchPointer() && gap < minOcclusionPx) {
      return "none";
    }
    return "layout_resize";
  }

  if (!hasCoarseOrTouchPointer()) return "none";
  return "visual_overlay";
}

export function detectFormKeyboardRuntimeContext(args?: {
  safeBottomPx?: number;
  layoutAlignedSlackPx?: number;
  minOcclusionPx?: number;
}): FormKeyboardRuntimeContext {
  const frame = resolveFormVisualViewportFrame();
  const width =
    typeof window !== "undefined" ? Math.round(window.innerWidth || frame.heightPx) : frame.heightPx;
  const height =
    typeof window !== "undefined" ? Math.round(window.innerHeight || frame.heightPx) : frame.heightPx;
  const safeBottomPx =
    typeof args?.safeBottomPx === "number" && Number.isFinite(args.safeBottomPx)
      ? Math.max(0, Math.round(args.safeBottomPx))
      : readCssSafeBottomPx();

  return {
    platformFamily: resolveFormKeyboardPlatformFamily(),
    formFactor: resolveFormKeyboardFormFactor(width, height),
    orientation: resolveFormKeyboardOrientation(width, height),
    navigationMode: "not_inferred",
    keyboardModel: resolveFormKeyboardModel({
      layoutAlignedSlackPx: args?.layoutAlignedSlackPx,
      minOcclusionPx: args?.minOcclusionPx,
    }),
    safeBottomPx,
    viewportWidth: width,
    viewportHeight: height,
    visualViewportHeight: frame.heightPx,
    visualViewportOffsetTop: frame.offsetTopPx,
  };
}

/**
 * Adapter-owned occlusion: same product rule, model-specific path.
 * `none` → 0 (physical KB / no OSK occlusion). Never adds safeBottom.
 */
export function resolveFormAdapterKeyboardOcclusionInsetPx(
  ctx: FormKeyboardRuntimeContext,
  args?: {
    nativeShellInsetPx?: number | null;
    layoutAlignedSlackPx?: number;
    minOcclusionPx?: number;
  }
): number {
  if (ctx.keyboardModel === "none") return 0;

  const minOcclusionPx = args?.minOcclusionPx ?? FORM_KEYBOARD_MIN_OCCLUSION_PX;
  const layoutAlignedSlackPx = args?.layoutAlignedSlackPx;

  if (ctx.keyboardModel === "layout_resize") {
    if (isFormLayoutAlignedWithVisualViewport(layoutAlignedSlackPx)) return 0;
    // Layout claimed resize but vv still overlays — fall through to measured gap.
  }

  if (typeof window === "undefined") return 0;
  if (isFormLayoutAlignedWithVisualViewport(layoutAlignedSlackPx)) return 0;

  const native = args?.nativeShellInsetPx;
  if (typeof native === "number" && Number.isFinite(native) && native >= minOcclusionPx) {
    return Math.round(native);
  }

  const gap = resolveFormVisualViewportOverlayGapPx();
  return gap >= minOcclusionPx ? gap : 0;
}

/** Matrix / probe row — do not collapse to a single PASS line. */
export function formKeyboardRuntimeContextMatrixRow(
  ctx: FormKeyboardRuntimeContext,
  extra?: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean | null | undefined> {
  return {
    platformFamily: ctx.platformFamily,
    formFactor: ctx.formFactor,
    orientation: ctx.orientation,
    navigationMode: ctx.navigationMode,
    keyboardModel: ctx.keyboardModel,
    viewportWidth: ctx.viewportWidth,
    viewportHeight: ctx.viewportHeight,
    visualViewportHeight: ctx.visualViewportHeight,
    visualViewportOffsetTop: ctx.visualViewportOffsetTop,
    safeBottom: ctx.safeBottomPx,
    ...extra,
  };
}
