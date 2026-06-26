/**
 * DIBAY Image V2 — public adapter surface (Phase 1).
 *
 * Consumers may import from `@/lib/image` in Phase 2+.
 * Phase 1: existing components keep using `lib/media/*` directly; this layer is additive.
 */
export {
  IMAGE_ADAPTER_PHASE,
  IMAGE_POLICY_PASSTHROUGH,
  currentImagePolicyMode,
  type ImageAdapterPhase,
  type ImagePolicyMode,
} from "@/lib/image/image-policy";

export {
  COMMUNITY_FEED_THUMB_DISPLAY_PX,
  DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  DELIVERY_DETAIL_HERO_QUALITY,
  DELIVERY_IMAGE_FETCH_PRESET,
  FEED_LCP_PRIORITY_COUNT,
  TRADE_FEED_THUMB_DISPLAY_PX,
  imageDeliveryFetchPxFromPreset,
  imageDeliveryThumbFetchPx,
  imagePostThumbFetchPx,
  type DeliveryImageFetchPreset,
} from "@/lib/image/image-size";

export {
  imageBuildFeedThumbnailFetchUrl,
  imageBuildPostThumbnailFetchUrl,
  imageBuildPostTransformUrl,
  imageBuildStoreProductHeroFetchUrl,
  imageBuildStoreProductThumbnailFetchUrl,
  imageBuildStoreProductThumbnailFetchUrlFromPreset,
  imageBuildStoreProductTransformUrl,
  imageIsPreOptimizedStoreProductUrl,
  type ImageTransformOpts,
} from "@/lib/image/image-transform";

export {
  imageHasCustomUserAvatar,
  imageIsLikelyUserUploadedAvatarUrl,
  imageNormalizeProfileAvatarForDb,
  imageResolveDeliveryMediaFetchSrc,
  imageResolveDeliveryMediaSurfacePreset,
  imageResolvePostPublicUrl,
  imageResolveStoreProductMediaUrl,
  imageResolveUserAvatarSrc,
  imageSanitizeViewerMediaUrl,
  type DeliveryMediaSurfacePreset,
} from "@/lib/image/image-url";

export {
  imageIsThumbnailLoaded,
  imageMarkThumbnailLoaded,
  imageProbeBrowserCachedComplete,
} from "@/lib/image/image-cache";

export {
  loadImageFetchUrl,
  loadTradeFeedThumbnailFetchUrl,
  type ImageLoaderDeliverySurfaceInput,
  type ImageLoaderFeedInput,
  type ImageLoaderInput,
  type ImageLoaderPostThumbInput,
  type ImageLoaderPostTransformInput,
  type ImageLoaderStoreHeroInput,
  type ImageLoaderStorePresetInput,
  type ImageLoaderStoreThumbInput,
  type ImageLoaderStoreTransformInput,
} from "@/lib/image/image-loader";

export {
  imageResolveTradePostDetailDisplayUrl,
  imageResolveTradePostDetailImageUrls,
  TRADE_POST_DETAIL_TIER_1280_ENABLED,
  TRADE_POST_DETAIL_TIER_FETCH_PX,
} from "@/lib/image/image-trade-detail";
