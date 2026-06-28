import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import {
  buildPostImageThumbnailFetchUrl,
  buildPostImageTransformUrl,
  postImageThumbFetchPx,
} from "@/lib/media/post-image-transform";
import { isThumbnailUrlLoaded } from "@/lib/media/thumbnail-loaded-url-memory";
import {
  buildStoreProductHeroFetchUrl,
  buildStoreProductImageTransformUrl,
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
  deliveryImageFetchPxFromPreset,
  deliveryThumbFetchPx,
  isPreOptimizedStoreProductImageUrl,
} from "@/lib/media/store-product-image-transform";
import {
  resolveDeliveryMediaFetchSrc,
  resolveDeliveryMediaSurfacePreset,
} from "@/lib/dibay/delivery-image-surface-presets";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import { sanitizeViewerMediaUrl } from "@/lib/media/sanitize-viewer-media-url";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";
import {
  hasCustomUserAvatar,
  resolveUserAvatarImageSrc,
} from "@/lib/profile/user-avatar-display";
import {
  COMMUNITY_FEED_THUMB_DISPLAY_PX,
  TRADE_FEED_THUMB_DISPLAY_PX,
  imageDeliveryFetchPxFromPreset,
  imageDeliveryThumbFetchPx,
  imagePostThumbFetchPx,
} from "@/lib/image/image-size";
import {
  imageBuildFeedThumbnailFetchUrl,
  imageBuildPostThumbnailFetchUrl,
  imageBuildPostTransformUrl,
  imageBuildStoreProductHeroFetchUrl,
  imageBuildStoreProductThumbnailFetchUrl,
  imageBuildStoreProductThumbnailFetchUrlFromPreset,
  imageBuildStoreProductTransformUrl,
  imageIsPreOptimizedStoreProductUrl,
} from "@/lib/image/image-transform";
import {
  imageHasCustomUserAvatar,
  imageResolveDeliveryMediaFetchSrc,
  imageResolveDeliveryMediaSurfacePreset,
  imageResolvePostPublicUrl,
  imageResolveStoreProductMediaUrl,
  imageResolveUserAvatarSrc,
  imageSanitizeViewerMediaUrl,
} from "@/lib/image/image-url";
import {
  imageIsThumbnailLoaded,
  imageMarkThumbnailLoaded,
} from "@/lib/image/image-cache";
import { loadImageFetchUrl, loadTradeFeedThumbnailFetchUrl } from "@/lib/image/image-loader";
import { currentImagePolicyMode, IMAGE_ADAPTER_PHASE } from "@/lib/image/image-policy";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/community/a.jpg";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
const AVATAR_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/u1/profile/av.jpg";

describe("lib/image adapter parity (Phase 2A)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("policy — phase 2 tier snap", () => {
    expect(IMAGE_ADAPTER_PHASE).toBe(2);
    expect(currentImagePolicyMode()).toBe("tier");
  });

  describe("image-size", () => {
    it("tier snap helpers replace legacy retina clamp", () => {
      expect(imagePostThumbFetchPx(88)).toBe(320);
      expect(imagePostThumbFetchPx(120)).toBe(320);
      expect(imageDeliveryThumbFetchPx(56)).toBe(320);
      expect(imageDeliveryFetchPxFromPreset("menu")).toBe(320);
      expect(imageDeliveryFetchPxFromPreset("detailHero")).toBe(1280);
    });

    it("re-exports feed display constants", () => {
      expect(COMMUNITY_FEED_THUMB_DISPLAY_PX).toBe(88);
      expect(TRADE_FEED_THUMB_DISPLAY_PX).toBe(120);
    });
  });

  describe("image-transform", () => {
    it("post transform URL — tier snap", () => {
      const opts = { width: 176, height: 176, quality: 78 };
      expect(imageBuildPostTransformUrl(POST_RAW, opts)).toBe(buildPostImageTransformUrl(POST_RAW, opts));
      expect(imageBuildPostTransformUrl(POST_RAW, opts)).toContain("width=320");
    });

    it("post thumbnail fetch URL — tier 320", () => {
      expect(imageBuildPostThumbnailFetchUrl(POST_RAW, 88)).toBe(
        buildPostImageThumbnailFetchUrl(POST_RAW, 88)
      );
      expect(imageBuildPostThumbnailFetchUrl(POST_RAW, 88)).toContain("width=320");
    });

    it("store transform URL — tier snap", () => {
      const opts = { width: 232, height: 232 };
      expect(imageBuildStoreProductTransformUrl(STORE_RAW, opts)).toBe(
        buildStoreProductImageTransformUrl(STORE_RAW, opts)
      );
      expect(imageBuildStoreProductTransformUrl(STORE_RAW, opts)).toContain("width=320");
    });

    it("store thumbnail fetch URL — object/public", () => {
      expect(imageBuildStoreProductThumbnailFetchUrl(STORE_RAW, 92)).toBe(
        buildStoreProductThumbnailFetchUrl(STORE_RAW, 92)
      );
      expect(imageBuildStoreProductThumbnailFetchUrl(STORE_RAW, 92)).toBe(STORE_RAW);
    });

    it("store preset thumbnail fetch URL — object/public for list preset", () => {
      expect(imageBuildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "hubFood")).toBe(
        buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "hubFood")
      );
      expect(imageBuildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "hubFood")).toBe(STORE_RAW);
    });

    it("store hero fetch URL — 1280 tier", () => {
      expect(imageBuildStoreProductHeroFetchUrl(STORE_RAW)).toBe(buildStoreProductHeroFetchUrl(STORE_RAW));
      expect(imageBuildStoreProductHeroFetchUrl(STORE_RAW)).toContain("width=1280");
    });

    it("feed thumbnail fetch URL", () => {
      expect(imageBuildFeedThumbnailFetchUrl(POST_RAW, 120)).toBe(
        buildFeedThumbnailFetchUrl(POST_RAW, 120)
      );
      expect(imageBuildFeedThumbnailFetchUrl(STORE_RAW, 92)).toBe(
        buildFeedThumbnailFetchUrl(STORE_RAW, 92)
      );
    });

    it("pre-optimized store URL detection", () => {
      const render =
        "https://abc.supabase.co/storage/v1/render/image/public/store-product-images/s1/p1.webp?width=96";
      expect(imageIsPreOptimizedStoreProductUrl(render)).toBe(isPreOptimizedStoreProductImageUrl(render));
    });
  });

  describe("image-url", () => {
    it("post public URL", () => {
      expect(imageResolvePostPublicUrl("user/a.jpg")).toBe(resolvePostImagePublicUrl("user/a.jpg"));
    });

    it("store product media URL", () => {
      expect(imageResolveStoreProductMediaUrl("s1/p1.webp")).toBe(resolveStoreProductMediaUrl("s1/p1.webp"));
    });

    it("user avatar src", () => {
      expect(imageResolveUserAvatarSrc(AVATAR_RAW)).toBe(resolveUserAvatarImageSrc(AVATAR_RAW));
      expect(imageResolveUserAvatarSrc("")).toBe(resolveUserAvatarImageSrc(""));
    });

    it("has custom avatar", () => {
      expect(imageHasCustomUserAvatar(AVATAR_RAW)).toBe(hasCustomUserAvatar(AVATAR_RAW));
    });

    it("delivery media fetch src", () => {
      expect(imageResolveDeliveryMediaFetchSrc(STORE_RAW, "detail-hero")).toBe(
        resolveDeliveryMediaFetchSrc(STORE_RAW, "detail-hero")
      );
      expect(imageResolveDeliveryMediaFetchSrc(STORE_RAW, "detail-hero-transition")).toBe(
        resolveDeliveryMediaFetchSrc(STORE_RAW, "detail-hero-transition")
      );
    });

    it("delivery surface preset", () => {
      expect(imageResolveDeliveryMediaSurfacePreset("detail-hero")).toEqual(
        resolveDeliveryMediaSurfacePreset("detail-hero")
      );
    });

    it("sanitize viewer media URL", () => {
      const blob = "blob:https://example.com/abc";
      expect(imageSanitizeViewerMediaUrl(blob)).toBe(sanitizeViewerMediaUrl(blob));
      expect(imageSanitizeViewerMediaUrl(POST_RAW)).toBe(sanitizeViewerMediaUrl(POST_RAW));
    });
  });

  describe("image-cache", () => {
    it("delegates loaded-url memory", () => {
      const url = "https://example.com/thumb-parity-test.webp";
      imageMarkThumbnailLoaded(url);
      expect(imageIsThumbnailLoaded(url)).toBe(isThumbnailUrlLoaded(url));
    });
  });

  describe("image-loader", () => {
    it("feed kind matches buildFeedThumbnailFetchUrl", () => {
      expect(
        loadImageFetchUrl({ kind: "feed", raw: POST_RAW, displayPx: TRADE_FEED_THUMB_DISPLAY_PX })
      ).toBe(buildFeedThumbnailFetchUrl(POST_RAW, TRADE_FEED_THUMB_DISPLAY_PX));
    });

    it("trade feed SSOT helper matches feed kind at TRADE_FEED_THUMB_DISPLAY_PX", () => {
      expect(loadTradeFeedThumbnailFetchUrl(POST_RAW)).toBe(
        buildFeedThumbnailFetchUrl(POST_RAW, TRADE_FEED_THUMB_DISPLAY_PX)
      );
    });

    it("post-thumb kind matches legacy", () => {
      expect(loadImageFetchUrl({ kind: "post-thumb", raw: POST_RAW, displayPx: 88 })).toBe(
        buildPostImageThumbnailFetchUrl(POST_RAW, 88)
      );
    });

    it("store-thumb kind matches legacy", () => {
      expect(loadImageFetchUrl({ kind: "store-thumb", raw: STORE_RAW, displayPx: 92 })).toBe(
        buildStoreProductThumbnailFetchUrl(STORE_RAW, 92)
      );
    });

    it("store-preset kind matches legacy", () => {
      expect(loadImageFetchUrl({ kind: "store-preset", raw: STORE_RAW, preset: "rowFeatured" })).toBe(
        buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "rowFeatured")
      );
    });

    it("store-hero kind matches legacy", () => {
      expect(loadImageFetchUrl({ kind: "store-hero", raw: STORE_RAW })).toBe(
        buildStoreProductHeroFetchUrl(STORE_RAW)
      );
    });

    it("delivery-surface kind matches legacy", () => {
      expect(
        loadImageFetchUrl({ kind: "delivery-surface", src: STORE_RAW, surface: "detail-hero" })
      ).toBe(resolveDeliveryMediaFetchSrc(STORE_RAW, "detail-hero"));
    });

    it("post-transform kind matches legacy", () => {
      const opts = { width: 240, height: 240 };
      expect(loadImageFetchUrl({ kind: "post-transform", raw: POST_RAW, opts })).toBe(
        buildPostImageTransformUrl(POST_RAW, opts)
      );
    });

    it("store-transform kind — tier snap", () => {
      const opts = { width: 184, height: 184 };
      expect(loadImageFetchUrl({ kind: "store-transform", raw: STORE_RAW, opts })).toBe(
        buildStoreProductImageTransformUrl(STORE_RAW, opts)
      );
      expect(loadImageFetchUrl({ kind: "store-transform", raw: STORE_RAW, opts })).toContain("width=320");
    });
  });
});
