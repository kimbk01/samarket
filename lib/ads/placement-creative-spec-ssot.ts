/**
 * MASTER CONTRACT — Placement Creative Spec SSOT (geometry / crop / formats).
 * Ratios and px come from renderer/inventory registries — not design-board mock numbers.
 * Max upload bytes = tech constraint only (never sold as “ad quality”).
 */

import { getFeedAdCreativeSpec, type FeedAdHostDensity } from "@/lib/ads/feed-ad-geometry";
import {
  bannerPixelGuideForInventory,
  type BannerCreativePixelGuide,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { OWNER_BANNER_CROP_POLICY } from "@/lib/stores/advertising/owner-banner-contract";
import {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  POPUP_CREATIVE_SOURCE_MAX_BYTES,
  PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS,
} from "@/lib/platform-popup/creative-pixel-ssot";
import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";

export type PlacementCreativeDomain = "delivery_banner" | "feed_banner" | "platform_popup";

export type PlacementCreativeSpecPanel = {
  domain: PlacementCreativeDomain;
  placementKey: string;
  ratioLabel: string;
  recommendedWidth: number;
  recommendedHeight: number;
  minWidth: number;
  minHeight: number;
  formats: readonly string[];
  cropCapable: boolean;
  /** Tech-only — do not show as product quality copy in applicant UI. */
  maxUploadBytesTechOnly: number | null;
  safeAreaNoteKo: string;
  safeAreaNoteEn: string;
};

const IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;

export function deliveryBannerCreativeSpec(
  inventoryKey: string
): PlacementCreativeSpecPanel | null {
  const guide: BannerCreativePixelGuide | null = bannerPixelGuideForInventory(inventoryKey);
  if (!guide) return null;
  return {
    domain: "delivery_banner",
    placementKey: inventoryKey,
    ratioLabel: guide.ratioLabel,
    recommendedWidth: guide.recommendedWidth,
    recommendedHeight: guide.recommendedHeight,
    minWidth: guide.minWidth,
    minHeight: guide.minHeight,
    formats: IMAGE_FORMATS,
    cropCapable: OWNER_BANNER_CROP_POLICY.mode === "crop_capable",
    maxUploadBytesTechOnly: null,
    safeAreaNoteKo: guide.safeAreaNoteKo,
    safeAreaNoteEn: guide.safeAreaNoteEn,
  };
}

export function feedBannerCreativeSpec(density: FeedAdHostDensity): PlacementCreativeSpecPanel {
  const spec = getFeedAdCreativeSpec(density);
  return {
    domain: "feed_banner",
    placementKey: density,
    ratioLabel: spec.aspectLabel,
    recommendedWidth: spec.standardWidthPx,
    recommendedHeight: spec.standardHeightPx,
    minWidth: spec.minWidthPx,
    minHeight: spec.minHeightPx,
    formats: IMAGE_FORMATS,
    cropCapable: true,
    maxUploadBytesTechOnly: spec.maxFileBytes,
    safeAreaNoteKo: "중요 문구는 배너 중앙 안전 영역에 두세요.",
    safeAreaNoteEn: "Keep key copy inside the banner safe area.",
  };
}

export function platformPopupCreativeSpec(): PlacementCreativeSpecPanel {
  return {
    domain: "platform_popup",
    placementKey: "PLATFORM_POPUP",
    ratioLabel: `${PLATFORM_POPUP_CREATIVE_ASPECT.w}:${PLATFORM_POPUP_CREATIVE_ASPECT.h}`,
    recommendedWidth: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width,
    recommendedHeight: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height,
    minWidth: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width,
    minHeight: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height,
    formats: PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS,
    cropCapable: true,
    maxUploadBytesTechOnly: POPUP_CREATIVE_SOURCE_MAX_BYTES,
    safeAreaNoteKo: "CTA·로고는 가장자리에서 떨어뜨리세요.",
    safeAreaNoteEn: "Keep CTA and logo away from edges.",
  };
}
