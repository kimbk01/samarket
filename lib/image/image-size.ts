/**
 * DIBAY Image V2 — size constants & tier snap (Phase 2A adapter).
 */
import {
  COMMUNITY_FEED_THUMB_DISPLAY_PX,
  FEED_LCP_PRIORITY_COUNT,
  TRADE_FEED_THUMB_DISPLAY_PX,
} from "@/lib/media/feed-thumbnail-display";
import {
  IMAGE_AVATAR_TIERS,
  IMAGE_MESSENGER_TIERS,
  IMAGE_PRODUCT_TIERS,
  snapDeliveryPresetToProductTier,
  snapDisplayPxToProductTier,
  snapToProductTier,
  type ImageAvatarTier,
  type ImageProductTier,
} from "@/lib/image/image-tier";

export {
  COMMUNITY_FEED_THUMB_DISPLAY_PX,
  FEED_LCP_PRIORITY_COUNT,
  TRADE_FEED_THUMB_DISPLAY_PX,
};

export {
  IMAGE_AVATAR_TIERS,
  IMAGE_MESSENGER_TIERS,
  IMAGE_PRODUCT_TIERS,
  snapDisplayPxToProductTier,
  snapToProductTier,
  type ImageAvatarTier,
  type ImageProductTier,
};

/** Re-export delivery preset table (legacy px labels — Phase 2A maps to tiers at resolve time). */
export {
  DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  DELIVERY_DETAIL_HERO_QUALITY,
  DELIVERY_IMAGE_FETCH_PRESET,
  type DeliveryImageFetchPreset,
} from "@/lib/media/store-product-image-transform";

/** @deprecated Phase 2A — use snapDisplayPxToProductTier. Kept for caller compatibility. */
export function imagePostThumbFetchPx(displayPx: number): number {
  return snapDisplayPxToProductTier(displayPx);
}

/** @deprecated Phase 2A — list thumbs use object/public; tier snap for transform fallback only. */
export function imageDeliveryThumbFetchPx(displayPx: number): number {
  return snapDisplayPxToProductTier(displayPx);
}

/** Delivery preset → product tier (replaces 12 distinct legacy fetch widths). */
export function imageDeliveryFetchPxFromPreset(
  preset: import("@/lib/media/store-product-image-transform").DeliveryImageFetchPreset
): number {
  return snapDeliveryPresetToProductTier(preset);
}
