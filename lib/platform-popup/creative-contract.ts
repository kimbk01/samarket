/**
 * Platform Popup — creative aspect + pixel SSOT (CUT 1 / CUT 5-R).
 *
 * CARD: canonical 36:25 ratio tokens (aspect_w/h = 36/25).
 * ARTWORK: intrinsic positive pixel geometry — never forced to 36:25.
 * Unknown / missing creativeMode → CARD (legacy default; same as
 * `normalizePlatformPopupCreativeMode`).
 */

import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";
import { normalizePlatformPopupCreativeMode } from "@/lib/platform-popup/presentation-contract";
export {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  assertDibayCanonicalPopupCreativeSizeIs3625,
  dibayCanonicalPopupCreativeAspectRatio,
  PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS,
} from "@/lib/platform-popup/creative-pixel-ssot";

/**
 * Mode-aware creative aspect authority shared by approval + runtime eligibility.
 * Do not special-case individual pixel sizes (e.g. 716×681).
 */
export function isPlatformPopupCreativeAspectValid(
  aspectW: number,
  aspectH: number,
  creativeMode?: string | null
): boolean {
  if (!(Number.isFinite(aspectW) && Number.isFinite(aspectH))) return false;
  if (!(aspectW > 0) || !(aspectH > 0)) return false;

  const mode = normalizePlatformPopupCreativeMode(creativeMode);
  if (mode === "artwork") {
    // Intrinsic artwork geometry — positive finite dimensions only.
    return true;
  }

  // CARD (default / legacy unknown): strict 36:25 tokens.
  return aspectW === PLATFORM_POPUP_CREATIVE_ASPECT.w && aspectH === PLATFORM_POPUP_CREATIVE_ASPECT.h;
}

export function platformPopupCreativeAspectRatio(): number {
  return PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;
}
