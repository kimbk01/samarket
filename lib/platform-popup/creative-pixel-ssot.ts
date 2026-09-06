/**
 * CUT 5-R — DIBAY canonical popup creative pixel size (36:25).
 * Not a Baemin official pixel claim — DIBAY production SSOT only.
 */

import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";

/** Canonical production output: exactly 36:25. */
export const DIBAY_CANONICAL_POPUP_CREATIVE_SIZE = {
  width: 1440,
  height: 1000,
} as const;

export type DibayCanonicalPopupCreativeSize = typeof DIBAY_CANONICAL_POPUP_CREATIVE_SIZE;

export function assertDibayCanonicalPopupCreativeSizeIs3625(): boolean {
  const { width, height } = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE;
  return (
    width * PLATFORM_POPUP_CREATIVE_ASPECT.h === height * PLATFORM_POPUP_CREATIVE_ASPECT.w
  );
}

export function dibayCanonicalPopupCreativeAspectRatio(): number {
  return DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width / DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height;
}

export const PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS = ["JPG", "PNG", "WEBP"] as const;

/**
 * Source upload ceiling for popup (before sharp → 1440×1000 WebP).
 * Evidence: pipeline always re-encodes; 2MB was arbitrary for source.
 * Keep below common mobile decode risk; output is canonical WebP.
 */
export const POPUP_CREATIVE_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
