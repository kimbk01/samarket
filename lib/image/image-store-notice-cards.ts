/**
 * Store owner notice card images — `StoreOwnerNoticeCards` SSOT (Phase 1 adapter).
 *
 * CSS frame: `h-20 w-28` → display 80×112 px.
 * Fetch: each axis ×2 (retina), legacy clamp → 160×224 cover.
 *
 * Bucket: store-product-images (owner upload-image); post-images pass-through fallback.
 */
import { loadImageFetchUrl } from "@/lib/image/image-loader";
import { deliveryThumbFetchPx } from "@/lib/media/store-product-image-transform";

/** Tailwind `w-28` at 16px root. */
export const STORE_NOTICE_CARD_DISPLAY_WIDTH_PX = 112;

/** Tailwind `h-20` at 16px root. */
export const STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX = 80;

export function storeNoticeCardFetchWidthPx(): number {
  return deliveryThumbFetchPx(STORE_NOTICE_CARD_DISPLAY_WIDTH_PX);
}

export function storeNoticeCardFetchHeightPx(): number {
  return deliveryThumbFetchPx(STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX);
}

export function loadStoreNoticeCardImageFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const opts = {
    width: storeNoticeCardFetchWidthPx(),
    height: storeNoticeCardFetchHeightPx(),
  };
  const trimmed = raw.trim();
  if (trimmed.includes("post-images")) {
    return loadImageFetchUrl({ kind: "post-transform", raw, opts }) ?? trimmed;
  }
  return loadImageFetchUrl({ kind: "store-transform", raw, opts }) ?? trimmed;
}
