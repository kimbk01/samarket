/**
 * DIBAY Image V2 — canonical derivative fetch URL builders (Phase 2B).
 */
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import {
  buildPostImageDetailFetchUrl,
  buildPostImageThumbnailFetchUrl,
} from "@/lib/media/post-image-transform";
import {
  buildStoreProductHeroDerivativeUrl,
  buildStoreProductHeroFetchUrl,
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
  isPreOptimizedStoreProductImageUrl,
  type DeliveryImageFetchPreset,
} from "@/lib/media/store-product-image-transform";

/** @see buildPostImageThumbnailFetchUrl */
export function imageBuildPostThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  return buildPostImageThumbnailFetchUrl(raw, displayPx);
}

/** @see buildPostImageDetailFetchUrl */
export function imageBuildPostDetailFetchUrl(raw: string | null | undefined): string | null {
  return buildPostImageDetailFetchUrl(raw);
}

/** @see buildStoreProductHeroDerivativeUrl */
export function imageBuildStoreProductHeroDerivativeUrl(
  raw: string | null | undefined
): string | null {
  return buildStoreProductHeroDerivativeUrl(raw);
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
