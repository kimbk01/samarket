/**
 * DIBAY Image V2 — unified fetch-URL loader (Phase 1 adapter).
 *
 * Pipeline: ImageLoader → ImagePolicy (passthrough) → legacy transform → URL
 *
 * Phase 1 does not change routing logic — each entry point mirrors one legacy function.
 */
import { currentImagePolicyMode } from "@/lib/image/image-policy";
import {
  imageBuildFeedThumbnailFetchUrl,
  imageBuildPostThumbnailFetchUrl,
  imageBuildPostTransformUrl,
  imageBuildStoreProductHeroFetchUrl,
  imageBuildStoreProductThumbnailFetchUrl,
  imageBuildStoreProductThumbnailFetchUrlFromPreset,
  imageBuildStoreProductTransformUrl,
  type ImageTransformOpts,
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

export type ImageLoaderPostTransformInput = {
  kind: "post-transform";
  raw: string | null | undefined;
  opts: ImageTransformOpts;
};

export type ImageLoaderStoreTransformInput = {
  kind: "store-transform";
  raw: string | null | undefined;
  opts: ImageTransformOpts;
};

export type ImageLoaderInput =
  | ImageLoaderFeedInput
  | ImageLoaderPostThumbInput
  | ImageLoaderStoreThumbInput
  | ImageLoaderStorePresetInput
  | ImageLoaderStoreHeroInput
  | ImageLoaderDeliverySurfaceInput
  | ImageLoaderPostTransformInput
  | ImageLoaderStoreTransformInput;

/**
 * Trade feed list thumb (`PostCard`) — SSOT for width=240 transform path via feed kind.
 * @see buildFeedThumbnailFetchUrl with TRADE_FEED_THUMB_DISPLAY_PX (120 → fetch 240)
 */
export function loadTradeFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  return loadImageFetchUrl({ kind: "feed", raw, displayPx: TRADE_FEED_THUMB_DISPLAY_PX });
}

/**
 * Community feed list thumb (`ListThumb` on /philife) — SSOT for width=176 transform via feed kind.
 * @see buildFeedThumbnailFetchUrl with COMMUNITY_FEED_THUMB_DISPLAY_PX (88 → fetch 176)
 */
export function loadCommunityFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  return loadImageFetchUrl({ kind: "feed", raw, displayPx: COMMUNITY_FEED_THUMB_DISPLAY_PX });
}

/**
 * Single entry for fetch URLs. Phase 1: policy is passthrough — output equals legacy.
 */
export function loadImageFetchUrl(input: ImageLoaderInput): string | null {
  // Phase 2 will branch on currentImagePolicyMode() === "tier" here.
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
    case "post-transform":
      return imageBuildPostTransformUrl(input.raw, input.opts);
    case "store-transform":
      return imageBuildStoreProductTransformUrl(input.raw, input.opts);
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
}
