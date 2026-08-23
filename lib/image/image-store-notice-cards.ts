/**
 * Store owner notice card images — `StoreOwnerNoticeCards` SSOT (Phase 2A).
 *
 * CSS frame: `h-20 w-28` → display 80×112 px.
 * Phase 2A: store-product → object/public; post-images → 320 tier transform.
 */
import { loadImageFetchUrl } from "@/lib/image/image-loader";
import { snapToProductTier } from "@/lib/image/image-tier";

/** Tailwind `w-28` at 16px root. */
export const STORE_NOTICE_CARD_DISPLAY_WIDTH_PX = 112;

/** Tailwind `h-20` at 16px root. */
export const STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX = 80;

export function storeNoticeCardFetchWidthPx(): number {
  return snapToProductTier(STORE_NOTICE_CARD_DISPLAY_WIDTH_PX * 2);
}

export function storeNoticeCardFetchHeightPx(): number {
  return snapToProductTier(STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX * 2);
}

export function loadStoreNoticeCardImageFetchUrl(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.includes("store-product-images")) {
    return (
      loadImageFetchUrl({
        kind: "store-thumb",
        raw,
        displayPx: STORE_NOTICE_CARD_DISPLAY_WIDTH_PX,
      }) ?? trimmed
    );
  }
  return loadImageFetchUrl({ kind: "post-detail", raw }) ?? trimmed;
}
