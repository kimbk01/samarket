import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";
import {
  buildStoreProductThumbnailFetchUrl,
  resolveStoreProductObjectPublicUrl,
} from "@/lib/media/store-product-image-transform";

const POST_IMAGES_BUCKET = "post-images";
const STORE_PRODUCT_IMAGES_BUCKET = "store-product-images";

function bucketKind(raw: string): "post" | "store" | "other" {
  if (raw.includes(POST_IMAGES_BUCKET)) return "post";
  if (raw.includes(STORE_PRODUCT_IMAGES_BUCKET)) return "store";
  return "other";
}

/**
 * Feed card thumb URL — Phase 2A tier-unified.
 * - store-product-images → object/public (no runtime transform)
 * - post-images → tier transform (320 for list/card display px)
 * - external → pass-through
 */
export function buildFeedThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;

  const kind = bucketKind(trimmed);
  if (kind === "store") {
    return buildStoreProductThumbnailFetchUrl(trimmed, displayPx) ?? trimmed;
  }
  if (kind === "post") {
    return buildPostImageThumbnailFetchUrl(trimmed, displayPx) ?? trimmed;
  }

  const storeObject = resolveStoreProductObjectPublicUrl(trimmed);
  if (storeObject) return storeObject;

  return (
    buildPostImageThumbnailFetchUrl(trimmed, displayPx) ??
    buildStoreProductThumbnailFetchUrl(trimmed, displayPx) ??
    trimmed
  );
}
