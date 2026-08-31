/**
 * Shared Banner creative geometry validation (Owner + Admin upload).
 * Aspect from inventory seed; min pixels from open-event pixel guide SSOT.
 */

import {
  bannerPixelGuideForInventory,
  type BannerCreativePixelGuide,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { validateOwnerBannerCreativeAspect } from "@/lib/stores/advertising/owner-banner-contract";
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";

export type BannerCreativeGeometryError =
  | "invalid_dimensions"
  | "aspect_mismatch"
  | "below_min_pixels"
  | "invalid_inventory";

export type BannerCreativeGeometryResult =
  | { ok: true; guide: BannerCreativePixelGuide | null }
  | {
      ok: false;
      error: BannerCreativeGeometryError;
      guide: BannerCreativePixelGuide | null;
      width?: number;
      height?: number;
    };

export function validateBannerCreativeGeometry(input: {
  inventoryKey: string;
  width: number;
  height: number;
}): BannerCreativeGeometryResult {
  const guide = bannerPixelGuideForInventory(input.inventoryKey);
  if (!guide) {
    return { ok: false, error: "invalid_inventory", guide: null };
  }
  if (!(input.width > 0) || !(input.height > 0)) {
    return {
      ok: false,
      error: "invalid_dimensions",
      guide,
      width: input.width,
      height: input.height,
    };
  }
  const aspect = validateOwnerBannerCreativeAspect({
    inventoryKey: input.inventoryKey as DeliveryAdInventoryKey,
    sourceWidth: input.width,
    sourceHeight: input.height,
  });
  if (!aspect.ok) {
    return {
      ok: false,
      error: aspect.error,
      guide,
      width: input.width,
      height: input.height,
    };
  }
  if (input.width < guide.minWidth || input.height < guide.minHeight) {
    return {
      ok: false,
      error: "below_min_pixels",
      guide,
      width: input.width,
      height: input.height,
    };
  }
  return { ok: true, guide };
}

/** Human-facing rejection copy (ko/en) — never raw API codes. */
export function bannerGeometryRejectMessage(input: {
  error: BannerCreativeGeometryError;
  guide: BannerCreativePixelGuide | null;
  lang: "ko" | "en";
  placementLabel: string;
}): string {
  const g = input.guide;
  if (input.lang === "en") {
    if (input.error === "below_min_pixels" && g) {
      return `This image is below the minimum size for ${input.placementLabel}. Use at least ${g.minWidth}×${g.minHeight}px (${g.ratioLabel}).`;
    }
    if (input.error === "aspect_mismatch" && g) {
      return `This image does not match the ${input.placementLabel} aspect (${g.ratioLabel}). Recommended ${g.recommendedWidth}×${g.recommendedHeight}px.`;
    }
    return `This image does not meet the ${input.placementLabel} creative requirements.`;
  }
  if (input.error === "below_min_pixels" && g) {
    return `이 이미지는 ${input.placementLabel} 최소 규격보다 작습니다. 최소 ${g.minWidth}×${g.minHeight}px (${g.ratioLabel}) 이미지를 사용해 주세요.`;
  }
  if (input.error === "aspect_mismatch" && g) {
    return `이 이미지는 ${input.placementLabel} 규격과 맞지 않습니다. ${g.ratioLabel} 비율의 이미지를 사용해 주세요. 권장 크기 ${g.recommendedWidth}×${g.recommendedHeight}px.`;
  }
  return `이 이미지는 ${input.placementLabel} 배너 규격과 맞지 않습니다.`;
}
