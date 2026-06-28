/**
 * DIBAY Image V2 — transform URL builders (Phase 2A adapter).
 */
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import {
  buildPostImageThumbnailFetchUrl,
  buildPostImageTransformUrl,
} from "@/lib/media/post-image-transform";
import {
  buildStoreProductHeroFetchUrl,
  buildStoreProductImageTransformUrl,
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
  isPreOptimizedStoreProductImageUrl,
  type DeliveryImageFetchPreset,
} from "@/lib/media/store-product-image-transform";

export type ImageTransformOpts = { width: number; height?: number; quality?: number };

/** @see buildPostImageTransformUrl */
export function imageBuildPostTransformUrl(
  raw: string | null | undefined,
  opts: ImageTransformOpts
): string | null {
  return buildPostImageTransformUrl(raw, opts);
}

/** @see buildPostImageThumbnailFetchUrl */
export function imageBuildPostThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  return buildPostImageThumbnailFetchUrl(raw, displayPx);
}

/** @see buildStoreProductImageTransformUrl */
export function imageBuildStoreProductTransformUrl(
  raw: string | null | undefined,
  opts: ImageTransformOpts
): string | null {
  return buildStoreProductImageTransformUrl(raw, opts);
}

/** @see buildStoreProductThumbnailFetchUrl */
export function imageBuildStoreProductThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  return buildStoreProductThumbnailFetchUrl(raw, displayPx);
}

/** @see buildStoreProductThumbnailFetchUrlFromPreset */
export function imageBuildStoreProductThumbnailFetchUrlFromPreset(
  raw: string | null | undefined,
  preset: DeliveryImageFetchPreset
): string | null {
  return buildStoreProductThumbnailFetchUrlFromPreset(raw, preset);
}

/** @see buildStoreProductHeroFetchUrl */
export function imageBuildStoreProductHeroFetchUrl(raw: string | null | undefined): string | null {
  return buildStoreProductHeroFetchUrl(raw);
}

/** @see buildFeedThumbnailFetchUrl */
export function imageBuildFeedThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  return buildFeedThumbnailFetchUrl(raw, displayPx);
}

/** @see isPreOptimizedStoreProductImageUrl */
export function imageIsPreOptimizedStoreProductUrl(url: string | null | undefined): boolean {
  return isPreOptimizedStoreProductImageUrl(url);
}
