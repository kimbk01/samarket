import { describe, expect, it } from "vitest";
import {
  IMAGE_PRODUCT_TIERS,
  normalizeTierTransformDimensions,
  snapDeliveryPresetToProductTier,
  snapDisplayPxToProductTier,
  snapToProductTier,
} from "@/lib/image/image-tier";
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
  deliveryImageFetchPxFromPreset,
  resolveStoreProductObjectPublicUrl,
  DELIVERY_IMAGE_FETCH_PRESET,
} from "@/lib/media/store-product-image-transform";
import { currentImagePolicyMode, IMAGE_ADAPTER_PHASE } from "@/lib/image/image-policy";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/trade/item.jpg";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";

describe("Image Phase 2B — canonical derivatives", () => {
  it("policy — phase 2 derivative mode", () => {
    expect(IMAGE_ADAPTER_PHASE).toBe(2);
    expect(currentImagePolicyMode()).toBe("derivative");
  });

  describe("snapToProductTier", () => {
    it("snaps to nearest upper tier", () => {
      expect(snapToProductTier(80)).toBe(320);
      expect(snapToProductTier(321)).toBe(640);
      expect(snapToProductTier(2000)).toBe(1280);
    });
  });

  describe("store-product list/card — object/public", () => {
    it("thumbnail fetch returns stable object URL", () => {
      expect(buildStoreProductThumbnailFetchUrl(STORE_RAW, 88)).toBe(STORE_RAW);
    });

    it("resolveStoreProductObjectPublicUrl strips legacy render path", () => {
      const render =
        "https://abc.supabase.co/storage/v1/render/image/public/store-product-images/s1/p1.webp?width=96";
      const out = resolveStoreProductObjectPublicUrl(render);
      expect(out).toContain("/object/public/store-product-images/s1/p1.webp");
    });
  });

  describe("store-product hero — upload-time derivative", () => {
    it("detail hero uses .hero.webp", () => {
      const out = buildStoreProductHeroFetchUrl(STORE_RAW);
      expect(out).toContain(".hero.webp");
      expect(out).not.toContain("/render/image/");
    });

    it("heroTransition preset uses hero derivative", () => {
      const out = buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "heroTransition");
      expect(out).toContain(".hero.webp");
    });
  });

  describe("post-images — upload-time derivatives", () => {
    it("feed thumb uses surface by display px", () => {
      expect(buildPostImageThumbnailFetchUrl(POST_RAW, 120)).toContain(".feed.webp");
      expect(buildPostImageThumbnailFetchUrl(POST_RAW, 88)).toContain(".thumb.webp");
      expect(buildPostImageThumbnailFetchUrl(POST_RAW, 120)).not.toContain("/render/image/");
    });

    it("detail fetch maps to .detail.webp", () => {
      const out = buildPostImageDetailFetchUrl(POST_RAW);
      expect(out).toContain(".detail.webp");
    });
  });

  describe("feed thumbnail — bucket routing", () => {
    it("store feed item → object/public", () => {
      expect(buildFeedThumbnailFetchUrl(STORE_RAW, 120)).toBe(STORE_RAW);
    });

    it("post feed item → feed derivative", () => {
      expect(buildFeedThumbnailFetchUrl(POST_RAW, 120)).toContain(".feed.webp");
    });
  });

  describe("normalizeTierTransformDimensions", () => {
    it("hero keeps height 720 at width 1280", () => {
      const dims = normalizeTierTransformDimensions({ width: 960, height: 720, quality: 80 });
      expect(dims.width).toBe(1280);
      expect(dims.height).toBe(720);
    });

    it("product tiers are fixed set", () => {
      expect(IMAGE_PRODUCT_TIERS).toEqual([320, 640, 1280]);
    });
  });

  describe("store hero derivative URL", () => {
    it("maps to hero derivative", () => {
      const out = buildStoreProductHeroDerivativeUrl(STORE_RAW);
      expect(out).toContain(".hero.webp");
    });
  });

  describe("delivery preset → tier (legacy labels)", () => {
    it("list presets still snap to 320 for tier math", () => {
      expect(snapDeliveryPresetToProductTier("menu")).toBe(320);
      expect(deliveryImageFetchPxFromPreset("menu")).toBe(320);
    });
    it("hero presets → 1280", () => {
      expect(snapDeliveryPresetToProductTier("detailHero")).toBe(1280);
    });
    it("preset table unchanged", () => {
      expect(DELIVERY_IMAGE_FETCH_PRESET.menu).toBe(184);
    });
  });
});
