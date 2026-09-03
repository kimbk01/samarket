/**
 * Platform Popup — creative aspect + pixel SSOT (CUT 1 / CUT 5-R).
 */

import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";
export {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  assertDibayCanonicalPopupCreativeSizeIs3625,
  dibayCanonicalPopupCreativeAspectRatio,
  PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS,
} from "@/lib/platform-popup/creative-pixel-ssot";

export function isPlatformPopupCreativeAspectValid(aspectW: number, aspectH: number): boolean {
  return aspectW === PLATFORM_POPUP_CREATIVE_ASPECT.w && aspectH === PLATFORM_POPUP_CREATIVE_ASPECT.h;
}

export function platformPopupCreativeAspectRatio(): number {
  return PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;
}
