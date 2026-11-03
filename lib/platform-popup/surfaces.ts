/**
 * Platform Popup surface SSOT helpers.
 * GLOBAL = COMMUNITY + TRADE + DELIVERY + MYPAGE (계약 §3). DELIVERY_OWNER·ADMIN 은 직접 선택만.
 */

import {
  PLATFORM_POPUP_GLOBAL_SURFACES,
  type PlatformPopupConsumerSurface,
  type PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

export function expandPlatformPopupGlobalSurfaces(): readonly PlatformPopupConsumerSurface[] {
  return PLATFORM_POPUP_GLOBAL_SURFACES;
}

/** Whether a campaign surface row covers the resolved consumer surface. */
export function platformPopupSurfaceMatches(
  campaignSurfaces: readonly PlatformPopupTargetSurface[],
  resolved: PlatformPopupConsumerSurface
): boolean {
  if (campaignSurfaces.includes(resolved)) return true;
  if (campaignSurfaces.includes("GLOBAL")) {
    return (PLATFORM_POPUP_GLOBAL_SURFACES as readonly PlatformPopupConsumerSurface[]).includes(resolved);
  }
  return false;
}

/** Domain-targeted (non-GLOBAL-only) beats GLOBAL-only for winner ranking. */
export function platformPopupIsDomainTargeted(
  campaignSurfaces: readonly PlatformPopupTargetSurface[]
): boolean {
  return campaignSurfaces.some((s) => s !== "GLOBAL");
}
