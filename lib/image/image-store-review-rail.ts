/**
 * Store menu review rail thumb — `StoreMenuReviewFlowLink` SSOT (Phase 1 adapter).
 *
 * Display frame: 56×56 CSS (`SamarketThumbnail size={56}`).
 * Fetch: displayPx 56 → width/height 112 (retina ×2, legacy clamp).
 *
 * Branching:
 * - reviewPhoto (`post-images`) → post-thumb loader
 * - menuThumb (`store-product-images`) → store-thumb loader
 */
import { loadImageFetchUrl } from "@/lib/image/image-loader";

/** Matches `StoreMenuReviewFlowLink` SamarketThumbnail frame — do not change without UI audit. */
export const STORE_REVIEW_RAIL_THUMB_DISPLAY_PX = 56;

export function loadStoreReviewRailReviewPhotoFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  return (
    loadImageFetchUrl({
      kind: "post-thumb",
      raw,
      displayPx: STORE_REVIEW_RAIL_THUMB_DISPLAY_PX,
    }) ?? raw
  );
}

export function loadStoreReviewRailMenuThumbFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  return (
    loadImageFetchUrl({
      kind: "store-thumb",
      raw,
      displayPx: STORE_REVIEW_RAIL_THUMB_DISPLAY_PX,
    }) ?? raw
  );
}
