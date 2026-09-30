/**
 * REBUILD 14 P5 — Canonical geometry / fit execution SSOT.
 *
 * Semantic geometry only (normalized 9:16). Pixel projection remains host work.
 * Thin wrappers delegate to existing fit engines — no divergent systemStartFit/introFit.
 */

import {
  STARTUP_COMPOSITION_ASPECT,
  parseNormalizedFrame,
  type NormalizedFrame,
} from "@/lib/startup-compositor/geometry";
import {
  fitContentRegion,
  mapFrame,
  type ContentRegion,
  type DeviceRect,
} from "@/lib/intro/geometry/fit";
import {
  centerFrame,
  clampFrame,
  containMediaFrame,
  roundNorm,
  type MediaSize,
} from "@/lib/intro/geometry/element-layout";
import { centerNormalizedFrame } from "@/lib/startup-compositor/intro/geometry";

export type FitMode = "CONTAIN" | "COVER";

export type AuthorityClassification =
  | "OWNER_LOCKED"
  | "EXISTING_PRODUCT_CONTRACT"
  | "IMPLEMENTATION_CHOICE"
  | "MISSING";

/** Authored composition aspect — EXISTING_PRODUCT_CONTRACT (P1/P4). */
export const CANONICAL_COMPOSITION_ASPECT = STARTUP_COMPOSITION_ASPECT;

/**
 * Explicit center (top-left normalized frame):
 * x = (1 - width) / 2
 * y = (1 - height) / 2
 * EXISTING_PRODUCT_CONTRACT (P4 centerNormalizedFrame / centerFrame).
 */
export function explicitCenterFrame(frame: NormalizedFrame): NormalizedFrame {
  const centered = centerNormalizedFrame(frame.w, frame.h);
  return clampFrame({ ...centered, w: frame.w, h: frame.h });
}

/** Alias retaining prior centerFrame behavior (position only). */
export function applyExplicitCenter(frame: NormalizedFrame): NormalizedFrame {
  return centerFrame(frame);
}

/**
 * Fit intrinsic media into an authored max box → new authored frame (insert sizing).
 * CONTAIN only for insert SSOT (P4 containMediaFrame). No stretch / fixed square.
 */
export function fitIntrinsicIntoMaxBox(args: {
  readonly intrinsic: MediaSize | null | undefined;
  readonly maxW: number;
  readonly maxH: number;
  readonly mode: FitMode;
}): NormalizedFrame {
  if (args.mode === "COVER") {
    // COVER insert sizing: fill max box (crop later at draw). Preserve aspect of box.
    return coverMediaFrame(args.intrinsic, args.maxW, args.maxH);
  }
  return containMediaFrame(args.intrinsic, args.maxW, args.maxH);
}

/**
 * COVER media into max box — fills the box; aspect preserved via crop at draw time.
 * IMPLEMENTATION_CHOICE: authored frame becomes the max box itself when intrinsic known;
 * when unknown, fail-closed thin slot (same policy as contain — never 55×55 square).
 */
export function coverMediaFrame(
  meta: MediaSize | null | undefined,
  maxW: number,
  maxH: number,
): NormalizedFrame {
  const mw = meta?.width;
  const mh = meta?.height;
  if (!mw || !mh || mw < 1 || mh < 1) {
    return centerFrame({
      x: 0,
      y: 0,
      w: roundNorm(maxW),
      h: roundNorm(maxH * 0.5),
    });
  }
  // Authored frame = max box; crop handled in fitMediaDrawInFrame(COVER).
  return centerFrame({ x: 0, y: 0, w: roundNorm(maxW), h: roundNorm(maxH) });
}

export type MediaDrawFit = {
  readonly mode: FitMode;
  readonly frame: NormalizedFrame;
  readonly draw: NormalizedFrame;
  /** True when COVER and intrinsic aspect ≠ frame aspect (renderer must crop). */
  readonly crop: boolean;
  readonly stretch: false;
  readonly intrinsicAspect: number;
};

/**
 * ONE shared fit engine for IMAGE/LOGO/System Start brand draw inside a frame.
 * CONTAIN: letterbox inside frame. COVER: draw==frame, crop when aspects differ.
 * No stretch. No device-specific math.
 */
export function fitMediaDrawInFrame(args: {
  readonly frame: NormalizedFrame;
  readonly intrinsicAspect: number;
  readonly mode: FitMode;
}):
  | { readonly ok: true; readonly value: MediaDrawFit }
  | { readonly ok: false; readonly reason: string } {
  const { frame, mode } = args;
  const parsed = parseNormalizedFrame(frame);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const aspect = args.intrinsicAspect;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return { ok: false, reason: "intrinsic_aspect_invalid" };
  }

  const frameAspect = frame.w / frame.h;
  const aspectDiffers = Math.abs(frameAspect - aspect) > 1e-6;

  if (mode === "COVER") {
    return {
      ok: true,
      value: {
        mode,
        frame,
        draw: { ...frame },
        crop: aspectDiffers,
        stretch: false,
        intrinsicAspect: aspect,
      },
    };
  }

  // CONTAIN: largest rect inside frame with intrinsic aspect, centered in frame.
  let drawW: number;
  let drawH: number;
  if (aspect > frameAspect) {
    drawW = frame.w;
    drawH = frame.w / aspect;
  } else {
    drawH = frame.h;
    drawW = frame.h * aspect;
  }
  const draw: NormalizedFrame = {
    x: roundNorm(frame.x + (frame.w - drawW) / 2),
    y: roundNorm(frame.y + (frame.h - drawH) / 2),
    w: roundNorm(drawW),
    h: roundNorm(drawH),
  };
  return {
    ok: true,
    value: {
      mode: "CONTAIN",
      frame,
      draw,
      crop: false,
      stretch: false,
      intrinsicAspect: aspect,
    },
  };
}

/** Composition→viewport letterbox — delegates to fitContentRegion. */
export function projectCompositionRegion(
  viewportW: number,
  viewportH: number,
): ContentRegion {
  return fitContentRegion(
    viewportW,
    viewportH,
    CANONICAL_COMPOSITION_ASPECT.w,
    CANONICAL_COMPOSITION_ASPECT.h,
  );
}

export function projectFrameToPixels(
  frame: NormalizedFrame,
  region: ContentRegion,
): DeviceRect {
  return mapFrame(frame, region);
}

export {
  parseNormalizedFrame,
  fitContentRegion,
  mapFrame,
  containMediaFrame,
  centerFrame,
  clampFrame,
  roundNorm,
  type NormalizedFrame,
  type ContentRegion,
  type DeviceRect,
  type MediaSize,
};
