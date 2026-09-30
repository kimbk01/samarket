/**
 * REBUILD 14 P3 — ONE canonical brand S/M/L → normalized geometry mapping.
 * Consumed by Owner and SYSTEM_BOOTSTRAP identically. No Android/iOS branches.
 */

import {
  BRAND_SIZE_NORM,
  type BrandSizePreset,
} from "@/lib/intro/system-start/contract";
import { STARTUP_COMPOSITION_ASPECT } from "@/lib/startup-compositor/geometry";

export { BRAND_SIZE_NORM };

/** Canonical: brandSizeNorm = logo width as fraction of composition width (0..1). */
export function brandSizeNormForPreset(preset: BrandSizePreset): number {
  return BRAND_SIZE_NORM[preset];
}

export type NormalizedBrandRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly sizeNorm: number;
  readonly intrinsicAspect: number;
};

/**
 * Compute brand rectangle in normalized composition space (0..1 × 0..1).
 * Preserves intrinsic aspect (width/height). No square coercion.
 *
 * @param intrinsicAspect width/height of brand asset (> 0)
 */
export function computeBrandNormalizedRect(args: {
  readonly preset: BrandSizePreset;
  readonly centerXNorm: number;
  readonly centerYNorm: number;
  readonly intrinsicAspect: number;
}):
  | { readonly ok: true; readonly value: NormalizedBrandRect }
  | { readonly ok: false; readonly reason: string } {
  const { preset, centerXNorm, centerYNorm, intrinsicAspect } = args;
  if (!Number.isFinite(centerXNorm) || centerXNorm < 0 || centerXNorm > 1) {
    return { ok: false, reason: "brand_center_x_out_of_bounds" };
  }
  if (!Number.isFinite(centerYNorm) || centerYNorm < 0 || centerYNorm > 1) {
    return { ok: false, reason: "brand_center_y_out_of_bounds" };
  }
  if (!Number.isFinite(intrinsicAspect) || intrinsicAspect <= 0) {
    return { ok: false, reason: "brand_intrinsic_aspect_invalid" };
  }
  const sizeNorm = brandSizeNormForPreset(preset);
  const w = sizeNorm;
  const h = w / intrinsicAspect;
  if (!Number.isFinite(h) || h <= 0) {
    return { ok: false, reason: "brand_height_invalid" };
  }
  const x = centerXNorm - w / 2;
  const y = centerYNorm - h / 2;
  return {
    ok: true,
    value: {
      x,
      y,
      w,
      h,
      centerX: centerXNorm,
      centerY: centerYNorm,
      sizeNorm,
      intrinsicAspect,
    },
  };
}

export const SYSTEM_START_COMPOSITION = STARTUP_COMPOSITION_ASPECT;
