/**
 * DIBAY Image V2 — size constants & fetch-px helpers (Phase 1 adapter).
 * Delegates to legacy modules; no tier snapping yet.
 */
import {
  COMMUNITY_FEED_THUMB_DISPLAY_PX,
  FEED_LCP_PRIORITY_COUNT,
  TRADE_FEED_THUMB_DISPLAY_PX,
} from "@/lib/media/feed-thumbnail-display";
import { postImageThumbFetchPx } from "@/lib/media/post-image-transform";
import {
  DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  DELIVERY_DETAIL_HERO_QUALITY,
  DELIVERY_IMAGE_FETCH_PRESET,
  deliveryImageFetchPxFromPreset,
  deliveryThumbFetchPx,
  type DeliveryImageFetchPreset,
} from "@/lib/media/store-product-image-transform";

export {
  COMMUNITY_FEED_THUMB_DISPLAY_PX,
  FEED_LCP_PRIORITY_COUNT,
  TRADE_FEED_THUMB_DISPLAY_PX,
  DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  DELIVERY_DETAIL_HERO_QUALITY,
  DELIVERY_IMAGE_FETCH_PRESET,
  type DeliveryImageFetchPreset,
};

/** @see postImageThumbFetchPx — post-images feed thumb fetch width */
export function imagePostThumbFetchPx(displayPx: number): number {
  return postImageThumbFetchPx(displayPx);
}

/** @see deliveryThumbFetchPx — store-product thumb fetch width */
export function imageDeliveryThumbFetchPx(displayPx: number): number {
  return deliveryThumbFetchPx(displayPx);
}

/** @see deliveryImageFetchPxFromPreset */
export function imageDeliveryFetchPxFromPreset(preset: DeliveryImageFetchPreset): number {
  return deliveryImageFetchPxFromPreset(preset);
}
