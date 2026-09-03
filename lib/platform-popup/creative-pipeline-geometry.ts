/**
 * CUT 5-R — pure geometry for 36:25 center crop (client + server safe).
 */

import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";

export const PLATFORM_POPUP_CREATIVE_RATIO_EPS = 0.01;

export const PLATFORM_POPUP_TARGET_RATIO =
  PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;

export type PlatformPopupCenterCropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function centerCropBoxTo3625(
  width: number,
  height: number
): PlatformPopupCenterCropBox {
  const current = width / height;
  if (current > PLATFORM_POPUP_TARGET_RATIO) {
    const cropW = Math.round(height * PLATFORM_POPUP_TARGET_RATIO);
    return { left: Math.floor((width - cropW) / 2), top: 0, width: cropW, height };
  }
  const cropH = Math.round(width / PLATFORM_POPUP_TARGET_RATIO);
  return { left: 0, top: Math.floor((height - cropH) / 2), width, height: cropH };
}

export function isPlatformPopupCreativeRatioOk(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  return Math.abs(width / height - PLATFORM_POPUP_TARGET_RATIO) <= PLATFORM_POPUP_CREATIVE_RATIO_EPS;
}
