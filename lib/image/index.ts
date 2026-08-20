/**
 * DIBAY Image V2 — public adapter surface (Phase 2A).
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
  IMAGE_PRODUCT_TIERS,
  IMAGE_AVATAR_TIERS,
  IMAGE_MESSENGER_TIERS,
  snapToProductTier,
  snapDisplayPxToProductTier,
  type ImageProductTier,
  type ImageAvatarTier,
} from "@/lib/image/image-tier";

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
  shouldStoreProductThumbUseObjectPublic,
  isStoreProductHeroPreset,
  IMAGE_POLICY_TIERS,
  type ImagePolicyDomain,
} from "@/lib/image/image-policy";

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
  STORE_BANNER_HERO_FETCH_WIDTH_PX,
  STORE_BANNER_HERO_MEASUREMENT,
  imageBuildStoreBannerHeroFetchUrl,
  loadStoreBannerHeroFetchUrl,
} from "@/lib/image/image-store-banner-hero";

export {
  STORE_REVIEW_RAIL_THUMB_DISPLAY_PX,
  loadStoreReviewRailMenuThumbFetchUrl,
  loadStoreReviewRailReviewPhotoFetchUrl,
} from "@/lib/image/image-store-review-rail";

export {
  STORE_REVIEWS_MENU_FILTER_DISPLAY_PX,
  STORE_REVIEWS_PER_REVIEW_PHOTO_DISPLAY_PX,
  STORE_REVIEWS_SUMMARY_PHOTO_DISPLAY_PX,
  loadStoreReviewsMenuFilterThumbFetchUrl,
  loadStoreReviewsPerReviewPhotoFetchUrl,
  loadStoreReviewsSummaryReviewPhotoFetchUrl,
} from "@/lib/image/image-store-reviews-section";

export {
  STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX,
  STORE_NOTICE_CARD_DISPLAY_WIDTH_PX,
  loadStoreNoticeCardImageFetchUrl,
  storeNoticeCardFetchHeightPx,
  storeNoticeCardFetchWidthPx,
} from "@/lib/image/image-store-notice-cards";

export {
  loadCommunityFeedThumbnailFetchUrl,
  loadImageFetchUrl,
  loadStoreProductThumbnailFetchUrl,
  loadStoreProductThumbnailFetchUrlFromPreset,
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

export { prefetchTradePostDetailHeroImage } from "@/lib/image/prefetch-trade-detail-hero";

export {
  imageResolveTradePostDetailRelatedDisplayUrl,
  imageResolveTradePostDetailRelatedThumbRaw,
  TRADE_POST_DETAIL_RELATED_DISPLAY_PX,
  TRADE_POST_DETAIL_RELATED_TIER_240_ENABLED,
} from "@/lib/image/image-trade-detail-related";
