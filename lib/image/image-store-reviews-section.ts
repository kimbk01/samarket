/**
 * Store reviews panel thumbs — `StoreReviewsSection` SSOT (Phase 1 adapter).
 *
 * Mirrors Review Rail loader pattern; displayPx matches existing CSS frames only.
 *
 * - menu filter rail: 52×52 → fetch 104 (store-product-images)
 * - photo summary strip: 68×68 → fetch 136 (post-images)
 * - per-review photo strip: 80×80 → fetch 160 (post-images)
 */
import { loadImageFetchUrl } from "@/lib/image/image-loader";

/** `SamarketThumbnail size={52}` on menu filter rail. */
export const STORE_REVIEWS_MENU_FILTER_DISPLAY_PX = 52;

/** Summary strip `h-[68px] w-[68px]`. */
export const STORE_REVIEWS_SUMMARY_PHOTO_DISPLAY_PX = 68;

/** Per-review strip `h-20 w-20`. */
export const STORE_REVIEWS_PER_REVIEW_PHOTO_DISPLAY_PX = 80;

export function loadStoreReviewsMenuFilterThumbFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  return (
    loadImageFetchUrl({
      kind: "store-thumb",
      raw,
      displayPx: STORE_REVIEWS_MENU_FILTER_DISPLAY_PX,
    }) ?? raw
  );
}

export function loadStoreReviewsSummaryReviewPhotoFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  return (
    loadImageFetchUrl({
      kind: "post-thumb",
      raw,
      displayPx: STORE_REVIEWS_SUMMARY_PHOTO_DISPLAY_PX,
    }) ?? raw
  );
}

export function loadStoreReviewsPerReviewPhotoFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  return (
    loadImageFetchUrl({
      kind: "post-thumb",
      raw,
      displayPx: STORE_REVIEWS_PER_REVIEW_PHOTO_DISPLAY_PX,
    }) ?? raw
  );
}
