/**
 * Platform Popup CUT 1 — creative aspect contract (36:25).
 * No renderer in this CUT.
 */

import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";

export function isPlatformPopupCreativeAspectValid(aspectW: number, aspectH: number): boolean {
  return aspectW === PLATFORM_POPUP_CREATIVE_ASPECT.w && aspectH === PLATFORM_POPUP_CREATIVE_ASPECT.h;
}

export function platformPopupCreativeAspectRatio(): number {
  return PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;
}
