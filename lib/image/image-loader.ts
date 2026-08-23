/**
 * DIBAY Image V2 — unified fetch-URL loader (Phase 2A: tier snap + object/public list thumbs).
 *
 * Pipeline: ImageLoader → ImagePolicy (tier) → media transform → URL
 */
import { currentImagePolicyMode } from "@/lib/image/image-policy";
import {
  imageBuildFeedThumbnailFetchUrl,
  imageBuildPostDetailFetchUrl,
  imageBuildPostThumbnailFetchUrl,
  imageBuildStoreProductHeroDerivativeUrl,
  imageBuildStoreProductHeroFetchUrl,
  imageBuildStoreProductThumbnailFetchUrl,
  imageBuildStoreProductThumbnailFetchUrlFromPreset,
} from "@/lib/image/image-transform";
import { imageResolveDeliveryMediaFetchSrc } from "@/lib/image/image-url";
import { TRADE_FEED_THUMB_DISPLAY_PX, COMMUNITY_FEED_THUMB_DISPLAY_PX, type DeliveryImageFetchPreset } from "@/lib/image/image-size";

export type ImageLoaderFeedInput = {
  kind: "feed";
  raw: string | null | undefined;
  displayPx: number;
};

export type ImageLoaderPostThumbInput = {
  kind: "post-thumb";
  raw: string | null | undefined;
  displayPx: number;
};

export type ImageLoaderStoreThumbInput = {
  kind: "store-thumb";
  raw: string | null | undefined;
  displayPx: number;
};

export type ImageLoaderStorePresetInput = {
  kind: "store-preset";
  raw: string | null | undefined;
  preset: DeliveryImageFetchPreset;
};

export type ImageLoaderStoreHeroInput = {
  kind: "store-hero";
  raw: string | null | undefined;
};

export type ImageLoaderDeliverySurfaceInput = {
  kind: "delivery-surface";
  src: string | null;
  surface: string;
};

export type ImageLoaderPostDetailInput = {
  kind: "post-detail";
  raw: string | null | undefined;
};

export type ImageLoaderStoreHeroDerivativeInput = {
  kind: "store-hero-derivative";
  raw: string | null | undefined;
};

export type ImageLoaderInput =
  | ImageLoaderFeedInput
  | ImageLoaderPostThumbInput
  | ImageLoaderStoreThumbInput
  | ImageLoaderStorePresetInput
  | ImageLoaderStoreHeroInput
  | ImageLoaderDeliverySurfaceInput
  | ImageLoaderPostDetailInput
  | ImageLoaderStoreHeroDerivativeInput;

/**
 * Trade feed list thumb (`PostCard`) — SSOT via feed kind (Phase 2A tier 320).
 * @see buildFeedThumbnailFetchUrl with TRADE_FEED_THUMB_DISPLAY_PX (120 → tier 320)
 */
export function loadTradeFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  return loadImageFetchUrl({ kind: "feed", raw, displayPx: TRADE_FEED_THUMB_DISPLAY_PX });
}

/**
 * Community feed list thumb (`ListThumb` on /philife) — SSOT via feed kind (Phase 2A tier 320).
 * @see buildFeedThumbnailFetchUrl with COMMUNITY_FEED_THUMB_DISPLAY_PX (88 → tier 320)
 */
export function loadCommunityFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  return loadImageFetchUrl({ kind: "feed", raw, displayPx: COMMUNITY_FEED_THUMB_DISPLAY_PX });
}

/**
 * Store product thumb (`StoreProductThumbnail`) — Phase 2A object/public for list/card.
 */
export function loadStoreProductThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  return loadImageFetchUrl({ kind: "store-thumb", raw, displayPx });
}

/**
 * Store product thumb by delivery preset (`fetchPreset` on `StoreProductThumbnail`).
 * @see buildStoreProductThumbnailFetchUrlFromPreset — menu=184, rowFeatured=232, etc.
 */
export function loadStoreProductThumbnailFetchUrlFromPreset(
  raw: string | null | undefined,
  preset: DeliveryImageFetchPreset
): string | null {
  return loadImageFetchUrl({ kind: "store-preset", raw, preset });
}

/**
 * Single entry for fetch URLs. Phase 2A: tier snap + store list object/public.
 */
export function loadImageFetchUrl(input: ImageLoaderInput): string | null {
  void currentImagePolicyMode();

  switch (input.kind) {
    case "feed":
      return imageBuildFeedThumbnailFetchUrl(input.raw, input.displayPx);
    case "post-thumb":
      return imageBuildPostThumbnailFetchUrl(input.raw, input.displayPx);
    case "store-thumb":
      return imageBuildStoreProductThumbnailFetchUrl(input.raw, input.displayPx);
    case "store-preset":
      return imageBuildStoreProductThumbnailFetchUrlFromPreset(input.raw, input.preset);
    case "store-hero":
      return imageBuildStoreProductHeroFetchUrl(input.raw);
    case "delivery-surface":
      return imageResolveDeliveryMediaFetchSrc(input.src, input.surface);
    case "post-detail":
      return imageBuildPostDetailFetchUrl(input.raw);
    case "store-hero-derivative":
      return imageBuildStoreProductHeroDerivativeUrl(input.raw);
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
}
