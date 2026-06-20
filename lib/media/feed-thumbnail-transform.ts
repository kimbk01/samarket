import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";
import { buildStoreProductThumbnailFetchUrl } from "@/lib/media/store-product-image-transform";

/**
 * Feed card thumb URL — post-images · store-product-images Supabase transform.
 * Non-storage URLs pass through unchanged.
 */
export function buildFeedThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return (
    buildPostImageThumbnailFetchUrl(trimmed, displayPx) ??
    buildStoreProductThumbnailFetchUrl(trimmed, displayPx) ??
    trimmed
  );
}
